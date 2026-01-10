import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as YAML from 'yaml';

export interface AvocadoExtension {
    name: string;
    type?: string;
    packages?: string[];
}

export interface AvocadoRuntime {
    name: string;
    packages?: string[];
    extensions?: string[];
}

export interface AvocadoSdk {
    image?: string;
    packages?: string[];
}

export interface AvocadoConfig {
    target?: string;
    sdk?: AvocadoSdk;
    extensions?: Record<string, AvocadoExtension>;
    runtimes?: Record<string, AvocadoRuntime>;
    targets?: Record<string, unknown>;
}

export interface AvocadoProject {
    name: string;
    configPath: string;
    workspaceFolder: vscode.WorkspaceFolder;
    config: AvocadoConfig;
}

export class AvocadoConfigWatcher implements vscode.Disposable {
    private projects: Map<string, AvocadoProject> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private folderWatcher: vscode.Disposable | undefined;
    private readonly _onProjectsChanged = new vscode.EventEmitter<Map<string, AvocadoProject>>();
    readonly onProjectsChanged = this._onProjectsChanged.event;

    async initialize(): Promise<void> {
        await this.findAllProjects();
        this.setupFileWatcher();
        this.setupFolderWatcher();
    }

    /**
     * Find all avocado.yaml files across all workspace folders
     */
    private async findAllProjects(): Promise<void> {
        this.projects.clear();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        for (const folder of workspaceFolders) {
            await this.loadProjectFromFolder(folder);
        }

        this._onProjectsChanged.fire(this.projects);
    }

    /**
     * Load project from a specific workspace folder
     */
    private async loadProjectFromFolder(folder: vscode.WorkspaceFolder): Promise<void> {
        // Try both avocado.yaml and avocado.yml
        for (const filename of ['avocado.yaml', 'avocado.yml']) {
            const configPath = path.join(folder.uri.fsPath, filename);
            if (fs.existsSync(configPath)) {
                await this.loadProject(configPath, folder);
                return;
            }
        }
    }

    /**
     * Load a project from a config file path
     */
    private async loadProject(configPath: string, folder: vscode.WorkspaceFolder): Promise<void> {
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = YAML.parse(content) as AvocadoConfig;

            const project: AvocadoProject = {
                name: folder.name,
                configPath,
                workspaceFolder: folder,
                config
            };

            this.projects.set(folder.uri.fsPath, project);
            console.log(`Loaded avocado project: ${folder.name} from ${configPath}`);
        } catch (error) {
            console.error(`Failed to parse ${configPath}:`, error);
        }
    }

    /**
     * Set up file watcher for config changes
     */
    private setupFileWatcher(): void {
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            '**/avocado.{yaml,yml}',
            false, // create
            false, // change
            false  // delete
        );

        this.fileWatcher.onDidChange(async (uri) => {
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (folder) {
                console.log('Config file changed:', uri.fsPath);
                await this.loadProject(uri.fsPath, folder);
                this._onProjectsChanged.fire(this.projects);
            }
        });

        this.fileWatcher.onDidCreate(async (uri) => {
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (folder) {
                console.log('Config file created:', uri.fsPath);
                await this.loadProject(uri.fsPath, folder);
                this._onProjectsChanged.fire(this.projects);
            }
        });

        this.fileWatcher.onDidDelete((uri) => {
            const folder = vscode.workspace.getWorkspaceFolder(uri);
            if (folder) {
                console.log('Config file deleted:', uri.fsPath);
                this.projects.delete(folder.uri.fsPath);
                this._onProjectsChanged.fire(this.projects);
            }
        });
    }

    /**
     * Watch for workspace folder changes
     */
    private setupFolderWatcher(): void {
        this.folderWatcher = vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
            // Load projects from added folders
            for (const folder of event.added) {
                await this.loadProjectFromFolder(folder);
            }

            // Remove projects from removed folders
            for (const folder of event.removed) {
                this.projects.delete(folder.uri.fsPath);
            }

            this._onProjectsChanged.fire(this.projects);
        });
    }

    /**
     * Get all loaded projects
     */
    getProjects(): AvocadoProject[] {
        return Array.from(this.projects.values());
    }

    /**
     * Get project count
     */
    getProjectCount(): number {
        return this.projects.size;
    }

    /**
     * Get a specific project by workspace folder path
     */
    getProject(folderPath: string): AvocadoProject | undefined {
        return this.projects.get(folderPath);
    }

    /**
     * Get the first project (for backwards compatibility)
     */
    getFirstProject(): AvocadoProject | undefined {
        const projects = this.getProjects();
        return projects.length > 0 ? projects[0] : undefined;
    }

    /**
     * Check if any projects exist
     */
    hasProjects(): boolean {
        return this.projects.size > 0;
    }

    // Legacy methods for backwards compatibility
    getConfig(): AvocadoConfig | undefined {
        return this.getFirstProject()?.config;
    }

    getConfigPath(): string | undefined {
        return this.getFirstProject()?.configPath;
    }

    hasConfig(): boolean {
        return this.hasProjects();
    }

    getSdkImage(): string | undefined {
        return this.getFirstProject()?.config.sdk?.image;
    }

    getTarget(): string | undefined {
        return this.getFirstProject()?.config.target;
    }

    getExtensionNames(): string[] {
        const config = this.getFirstProject()?.config;
        if (!config?.extensions) {
            return [];
        }
        return Object.keys(config.extensions);
    }

    getRuntimeNames(): string[] {
        const config = this.getFirstProject()?.config;
        if (!config?.runtimes) {
            return [];
        }
        return Object.keys(config.runtimes);
    }

    getTargetNames(): string[] {
        const config = this.getFirstProject()?.config;
        if (!config?.targets) {
            return [];
        }
        return Object.keys(config.targets);
    }

    /**
     * Get extension names for a specific project
     */
    getExtensionNamesForProject(project: AvocadoProject): string[] {
        if (!project.config?.extensions) {
            return [];
        }
        return Object.keys(project.config.extensions);
    }

    /**
     * Get runtime names for a specific project
     */
    getRuntimeNamesForProject(project: AvocadoProject): string[] {
        if (!project.config?.runtimes) {
            return [];
        }
        return Object.keys(project.config.runtimes);
    }

    dispose(): void {
        this.fileWatcher?.dispose();
        this.folderWatcher?.dispose();
        this._onProjectsChanged.dispose();
    }
}
