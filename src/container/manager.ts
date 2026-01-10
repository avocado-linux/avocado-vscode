import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

// Lightweight image for file exploration
const EXPLORER_IMAGE = 'alpine:latest';

interface VolumeState {
    volume_name: string;
    source_path: string;
    container_tool: string;
}

interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
    permissions: string;
    modified: string;
}

interface ProjectContainer {
    containerName: string;
    volumeName: string;
    folderPath: string;
}

export class ContainerManager {
    private containers: Map<string, ProjectContainer> = new Map();
    private containerTool: string = 'docker';
    private startingContainers: Set<string> = new Set();

    constructor() {}

    /**
     * Set the container tool (docker or podman)
     */
    setContainerTool(tool: string): void {
        this.containerTool = tool;
    }

    /**
     * Load volume state from .avocado-state file in a specific folder
     */
    async loadVolumeStateForFolder(folderPath: string): Promise<VolumeState | undefined> {
        const statePath = path.join(folderPath, '.avocado-state');
        try {
            if (fs.existsSync(statePath)) {
                const content = fs.readFileSync(statePath, 'utf-8');
                const state = JSON.parse(content) as VolumeState;
                if (state.container_tool) {
                    this.containerTool = state.container_tool;
                }
                return state;
            }
        } catch (error) {
            console.error(`Failed to load volume state from ${statePath}:`, error);
        }
        return undefined;
    }

    /**
     * Check if a container is running
     */
    async isContainerRunning(name: string): Promise<boolean> {
        try {
            const { stdout } = await execAsync(
                `${this.containerTool} inspect -f '{{.State.Running}}' ${name} 2>/dev/null`
            );
            return stdout.trim() === 'true';
        } catch {
            return false;
        }
    }

    /**
     * Ensure a container is running for a specific project folder
     */
    async ensureContainerForFolder(folderPath: string): Promise<string | undefined> {
        // Check if already starting
        if (this.startingContainers.has(folderPath)) {
            await this.waitForContainer(folderPath);
            return this.containers.get(folderPath)?.containerName;
        }

        // Check if we have an existing running container
        const existing = this.containers.get(folderPath);
        if (existing) {
            const running = await this.isContainerRunning(existing.containerName);
            if (running) {
                return existing.containerName;
            }
            // Container died, remove from map
            this.containers.delete(folderPath);
        }

        // Start a new container
        this.startingContainers.add(folderPath);
        try {
            const containerName = await this.startContainerForFolder(folderPath);
            return containerName;
        } finally {
            this.startingContainers.delete(folderPath);
        }
    }

    /**
     * Wait for a container to be ready
     */
    private async waitForContainer(folderPath: string): Promise<void> {
        const maxWait = 30000;
        const interval = 500;
        let waited = 0;

        while (this.startingContainers.has(folderPath) && waited < maxWait) {
            await new Promise(resolve => setTimeout(resolve, interval));
            waited += interval;
        }
    }

    /**
     * Start a lightweight container for file exploration
     */
    private async startContainerForFolder(folderPath: string): Promise<string | undefined> {
        const volumeState = await this.loadVolumeStateForFolder(folderPath);

        if (!volumeState) {
            console.warn(`No .avocado-state file found in ${folderPath}`);
            return undefined;
        }

        const containerName = `avocado-explorer-${Date.now()}-${path.basename(folderPath).replace(/[^a-zA-Z0-9]/g, '')}`;

        const args = [
            'run', '-d',
            '--name', containerName,
            '-v', `${volumeState.volume_name}:/opt/_avocado:ro`,
            EXPLORER_IMAGE,
            'sleep', 'infinity'
        ];

        try {
            await execAsync(`${this.containerTool} ${args.join(' ')}`);
            console.log(`Started explorer container for ${folderPath}: ${containerName}`);

            this.containers.set(folderPath, {
                containerName,
                volumeName: volumeState.volume_name,
                folderPath
            });

            return containerName;
        } catch (error) {
            console.error(`Failed to start container for ${folderPath}:`, error);
            return undefined;
        }
    }

    /**
     * Execute a command in a specific project's container
     */
    async execInContainerForFolder(folderPath: string, command: string): Promise<string> {
        const containerName = await this.ensureContainerForFolder(folderPath);
        if (!containerName) {
            throw new Error(`No container available for ${folderPath}`);
        }

        const { stdout } = await execAsync(
            `${this.containerTool} exec ${containerName} /bin/sh -c "${command.replace(/"/g, '\\"')}"`
        );
        return stdout;
    }

    /**
     * List files in a directory within a project's container
     */
    async listFilesForFolder(folderPath: string, dirPath: string): Promise<FileInfo[]> {
        try {
            // Use stat format compatible with busybox/alpine
            const command = `find "${dirPath}" -maxdepth 1 -mindepth 1 -exec stat -c '%F|%s|%a|%Y|%n' {} \\; 2>/dev/null | head -500`;
            const output = await this.execInContainerForFolder(folderPath, command);

            const files: FileInfo[] = [];
            const lines = output.trim().split('\n').filter(line => line.length > 0);

            for (const line of lines) {
                const parts = line.split('|');
                if (parts.length >= 5) {
                    const [type, size, permissions, modified, ...pathParts] = parts;
                    const fullPath = pathParts.join('|');
                    const name = path.posix.basename(fullPath);
                    files.push({
                        name,
                        path: fullPath,
                        isDirectory: type === 'directory',
                        size: parseInt(size, 10) || 0,
                        permissions,
                        modified
                    });
                }
            }

            files.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                    return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            return files;
        } catch (error) {
            console.error(`Failed to list files in ${dirPath}:`, error);
            return [];
        }
    }

    /**
     * Read file contents from a project's container
     */
    async readFileForFolder(folderPath: string, filePath: string): Promise<string | undefined> {
        try {
            const output = await this.execInContainerForFolder(folderPath, `cat "${filePath}"`);
            return output;
        } catch (error) {
            console.error(`Failed to read file ${filePath}:`, error);
            return undefined;
        }
    }

    /**
     * Check if a path exists in a project's container
     */
    async pathExistsForFolder(folderPath: string, checkPath: string): Promise<boolean> {
        try {
            await this.execInContainerForFolder(folderPath, `test -e "${checkPath}"`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get available targets from a project's volume
     */
    async getTargetsForFolder(folderPath: string): Promise<string[]> {
        try {
            const output = await this.execInContainerForFolder(
                folderPath,
                'ls -1 /opt/_avocado 2>/dev/null | head -50'
            );
            return output.trim().split('\n').filter(t => t.length > 0 && !t.startsWith('.'));
        } catch {
            return [];
        }
    }

    /**
     * Cleanup all containers
     */
    async cleanup(): Promise<void> {
        for (const [folderPath, container] of this.containers) {
            try {
                await execAsync(`${this.containerTool} stop -t 1 ${container.containerName} 2>/dev/null`).catch(() => {});
                await execAsync(`${this.containerTool} rm -f ${container.containerName} 2>/dev/null`).catch(() => {});
                console.log(`Cleaned up container: ${container.containerName}`);
            } catch (error) {
                console.error(`Failed to cleanup container for ${folderPath}:`, error);
            }
        }
        this.containers.clear();
    }

    /**
     * Cleanup container for a specific folder
     */
    async cleanupForFolder(folderPath: string): Promise<void> {
        const container = this.containers.get(folderPath);
        if (container) {
            try {
                await execAsync(`${this.containerTool} stop -t 1 ${container.containerName} 2>/dev/null`).catch(() => {});
                await execAsync(`${this.containerTool} rm -f ${container.containerName} 2>/dev/null`).catch(() => {});
                console.log(`Cleaned up container: ${container.containerName}`);
            } catch (error) {
                console.error(`Failed to cleanup container for ${folderPath}:`, error);
            }
            this.containers.delete(folderPath);
        }
    }
}
