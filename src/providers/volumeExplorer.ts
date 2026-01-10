import * as vscode from 'vscode';
import * as path from 'path';
import { ContainerManager } from '../container/manager';
import { AvocadoConfigWatcher, AvocadoProject } from '../utils/config';
import { TargetManager } from '../utils/targetManager';

export class VolumeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly itemPath: string,
        public readonly isDirectory: boolean,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly project?: AvocadoProject,
        public readonly size?: number,
        public readonly permissions?: string
    ) {
        super(label, collapsibleState);

        this.tooltip = this.buildTooltip();
        this.contextValue = this.getContextValue();

        // Set icon based on type
        if (isDirectory) {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else {
            this.iconPath = this.getFileIcon();
        }

        // Set description for files (size)
        if (!isDirectory && size !== undefined) {
            this.description = this.formatSize(size);
        }
    }

    // Expose path for backwards compatibility
    get path(): string {
        return this.itemPath;
    }

    private getContextValue(): string {
        if (this.project && !this.itemPath) {
            return 'project';
        }
        return this.isDirectory ? 'directory' : 'file';
    }

    private buildTooltip(): string {
        if (this.project && !this.itemPath) {
            return `Project: ${this.project.name}\nConfig: ${this.project.configPath}`;
        }
        const parts = [this.itemPath];
        if (this.permissions) {
            parts.push(`Permissions: ${this.permissions}`);
        }
        if (this.size !== undefined) {
            parts.push(`Size: ${this.formatSize(this.size)}`);
        }
        return parts.join('\n');
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) { return '0 B'; }
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }

    private getFileIcon(): vscode.ThemeIcon {
        const ext = path.extname(this.label).toLowerCase();
        const iconMap: Record<string, string> = {
            '.yaml': 'symbol-file',
            '.yml': 'symbol-file',
            '.json': 'json',
            '.sh': 'terminal',
            '.bash': 'terminal',
            '.py': 'symbol-method',
            '.rs': 'symbol-struct',
            '.c': 'symbol-method',
            '.cpp': 'symbol-method',
            '.h': 'symbol-interface',
            '.hpp': 'symbol-interface',
            '.md': 'markdown',
            '.txt': 'file-text',
            '.log': 'output',
            '.conf': 'settings-gear',
            '.config': 'settings-gear',
            '.toml': 'symbol-file',
            '.xml': 'code',
            '.html': 'code',
            '.css': 'symbol-color',
            '.rpm': 'package',
            '.tar': 'file-zip',
            '.gz': 'file-zip',
            '.xz': 'file-zip',
            '.img': 'device-mobile',
            '.raw': 'device-mobile',
        };
        return new vscode.ThemeIcon(iconMap[ext] || 'file');
    }
}

export class VolumeExplorerProvider implements vscode.TreeDataProvider<VolumeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<VolumeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(
        private containerManager: ContainerManager,
        private configWatcher: AvocadoConfigWatcher,
        private targetManager: TargetManager
    ) {
        // Update when projects change
        configWatcher.onProjectsChanged(() => {
            this.refresh();
        });

        // Update when target changes
        targetManager.onTargetChanged(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: VolumeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: VolumeItem): Promise<VolumeItem[]> {
        if (!element) {
            // Root level - show all projects
            return this.getProjectItems();
        }

        // If this is a project node (no path), show target structure
        if (element.project && !element.itemPath) {
            return this.getProjectContents(element.project);
        }

        // Otherwise get directory contents
        if (element.project && element.itemPath) {
            return this.getDirectoryContents(element.project, element.itemPath);
        }

        return [];
    }

    private async getProjectItems(): Promise<VolumeItem[]> {
        const projects = this.configWatcher.getProjects();

        if (projects.length === 0) {
            return [this.createMessageItem('No avocado projects found', 'Open a folder with avocado.yaml')];
        }

        const items: VolumeItem[] = [];

        for (const project of projects) {
            const item = new VolumeItem(
                project.name,
                '',
                true,
                vscode.TreeItemCollapsibleState.Collapsed,
                project
            );

            // Custom icon for project
            item.iconPath = new vscode.ThemeIcon('package');

            // Show selected target in description
            const selectedTarget = this.targetManager.getTarget(project);
            item.description = selectedTarget || 'no target selected';

            items.push(item);
        }

        return items;
    }

    private async getProjectContents(project: AvocadoProject): Promise<VolumeItem[]> {
        const folderPath = project.workspaceFolder.uri.fsPath;

        // Check for volume state
        const volumeState = await this.containerManager.loadVolumeStateForFolder(folderPath);
        if (!volumeState) {
            return [this.createMessageItem('No state volume found', 'Run "avocado install" to initialize', project)];
        }

        // Get targets from the volume
        let targets: string[];
        try {
            targets = await this.containerManager.getTargetsForFolder(folderPath);
        } catch (error) {
            return [this.createMessageItem('Failed to connect to container', `${error}`, project)];
        }

        if (targets.length === 0) {
            return [this.createMessageItem('Volume is empty', 'Run "avocado install" to set up the SDK', project)];
        }

        // Check for selected target
        const selectedTarget = this.targetManager.getTarget(project);
        if (selectedTarget && targets.includes(selectedTarget)) {
            return this.getTargetStructure(project, selectedTarget);
        }

        // If only one target, use it automatically
        if (targets.length === 1) {
            return this.getTargetStructure(project, targets[0]);
        }

        // Otherwise show all targets with a hint to select one
        const items: VolumeItem[] = [];

        // Add a hint item
        const hintItem = this.createMessageItem(
            'Select a target',
            'Use "Avocado: Select Target" command',
            project
        );
        hintItem.command = {
            command: 'avocado.selectTarget',
            title: 'Select Target',
            arguments: [{ project }]
        };
        items.push(hintItem);

        // Show available targets
        for (const target of targets) {
            const item = new VolumeItem(
                target,
                `/opt/_avocado/${target}`,
                true,
                vscode.TreeItemCollapsibleState.Collapsed,
                project
            );
            item.iconPath = new vscode.ThemeIcon('symbol-namespace');
            items.push(item);
        }

        return items;
    }

    private async getTargetStructure(project: AvocadoProject, target: string): Promise<VolumeItem[]> {
        const folderPath = project.workspaceFolder.uri.fsPath;
        const basePath = `/opt/_avocado/${target}`;
        const items: VolumeItem[] = [];

        const standardDirs = [
            { name: 'SDK', path: `${basePath}/sdk`, icon: 'symbol-namespace' },
            { name: 'Extensions', path: `${basePath}/extensions`, icon: 'extensions' },
            { name: 'Remote Extensions', path: `${basePath}/includes`, icon: 'cloud-download' },
            { name: 'Runtimes', path: `${basePath}/runtimes`, icon: 'device-mobile' },
            { name: 'Output', path: `${basePath}/output`, icon: 'package' },
        ];

        for (const dir of standardDirs) {
            const exists = await this.containerManager.pathExistsForFolder(folderPath, dir.path);
            if (exists) {
                const item = new VolumeItem(
                    dir.name,
                    dir.path,
                    true,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    project
                );
                item.iconPath = new vscode.ThemeIcon(dir.icon);
                items.push(item);
            }
        }

        return items;
    }

    private async getDirectoryContents(project: AvocadoProject, dirPath: string): Promise<VolumeItem[]> {
        const folderPath = project.workspaceFolder.uri.fsPath;

        try {
            const files = await this.containerManager.listFilesForFolder(folderPath, dirPath);
            return files.map(file => new VolumeItem(
                file.name,
                file.path,
                file.isDirectory,
                file.isDirectory
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
                project,
                file.size,
                file.permissions
            ));
        } catch (error) {
            console.error(`Failed to list directory ${dirPath}:`, error);
            return [];
        }
    }

    private createMessageItem(label: string, detail: string, project?: AvocadoProject): VolumeItem {
        const item = new VolumeItem(
            label,
            '',
            false,
            vscode.TreeItemCollapsibleState.None,
            project
        );
        item.description = detail;
        item.iconPath = new vscode.ThemeIcon('info');
        item.contextValue = 'message';
        return item;
    }
}
