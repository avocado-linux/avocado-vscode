import * as vscode from 'vscode';
import { ContainerManager } from './container/manager';
import { VolumeExplorerProvider, VolumeItem } from './providers/volumeExplorer';
import { AvocadoTerminalProfileProvider } from './providers/terminalProfile';
import { registerCommands } from './commands';
import { AvocadoConfigWatcher } from './utils/config';
import { TargetManager } from './utils/targetManager';

let containerManager: ContainerManager | undefined;
let configWatcher: AvocadoConfigWatcher | undefined;
let targetManager: TargetManager | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('Avocado DevTools is now active');

    // Initialize container manager
    containerManager = new ContainerManager();

    // Initialize config watcher
    configWatcher = new AvocadoConfigWatcher();
    await configWatcher.initialize();

    // Initialize target manager
    targetManager = new TargetManager(configWatcher, containerManager);
    context.subscriptions.push(targetManager);

    // Update status bar when projects change
    configWatcher.onProjectsChanged(() => {
        targetManager?.refreshStatusBar();
    });

    // Create volume explorer provider
    const volumeExplorerProvider = new VolumeExplorerProvider(containerManager, configWatcher, targetManager);

    // Register tree view
    const treeView = vscode.window.createTreeView('avocadoVolumeExplorer', {
        treeDataProvider: volumeExplorerProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register select target command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.selectTarget', async (item?: VolumeItem) => {
            if (targetManager) {
                const project = item?.project;
                await targetManager.selectTarget(project);
                volumeExplorerProvider.refresh();
            }
        })
    );

    // Register refresh command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.refresh', () => {
            volumeExplorerProvider.refresh();
        })
    );

    // Register copy path command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.copyPath', (item: VolumeItem) => {
            if (item && item.path) {
                vscode.env.clipboard.writeText(item.path);
                vscode.window.showInformationMessage(`Copied: ${item.path}`);
            }
        })
    );

    // Register open file command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.openFile', async (item: VolumeItem) => {
            if (item && item.path && item.project && containerManager) {
                try {
                    const folderPath = item.project.workspaceFolder.uri.fsPath;
                    const content = await containerManager.readFileForFolder(folderPath, item.path);
                    if (content !== undefined) {
                        const doc = await vscode.workspace.openTextDocument({
                            content: content,
                            language: getLanguageFromPath(item.path)
                        });
                        await vscode.window.showTextDocument(doc, { preview: true });
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                }
            }
        })
    );

    // Register main commands
    registerCommands(context, configWatcher, targetManager);

    // Register terminal profile provider
    const terminalProfileProvider = new AvocadoTerminalProfileProvider(configWatcher, targetManager);
    context.subscriptions.push(
        vscode.window.registerTerminalProfileProvider('avocado.sdkTerminal', terminalProfileProvider)
    );

    // Watch for config changes
    context.subscriptions.push(configWatcher);

    // Show welcome message
    const projectCount = configWatcher.getProjectCount();
    if (projectCount > 0) {
        const projectWord = projectCount === 1 ? 'project' : 'projects';
        vscode.window.showInformationMessage(
            `Avocado DevTools activated: ${projectCount} ${projectWord} found`
        );
    }
}

export async function deactivate(): Promise<void> {
    console.log('Avocado DevTools is deactivating');

    // Cleanup containers
    if (containerManager) {
        await containerManager.cleanup();
    }
}

function getLanguageFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
        'yaml': 'yaml',
        'yml': 'yaml',
        'json': 'json',
        'sh': 'shellscript',
        'bash': 'shellscript',
        'py': 'python',
        'rs': 'rust',
        'ts': 'typescript',
        'js': 'javascript',
        'c': 'c',
        'cpp': 'cpp',
        'h': 'c',
        'hpp': 'cpp',
        'md': 'markdown',
        'txt': 'plaintext',
        'conf': 'ini',
        'ini': 'ini',
        'toml': 'toml',
        'xml': 'xml',
        'html': 'html',
        'css': 'css',
    };
    return languageMap[ext || ''] || 'plaintext';
}
