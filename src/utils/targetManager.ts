import * as vscode from 'vscode';
import { AvocadoProject, AvocadoConfigWatcher } from './config';
import { ContainerManager } from '../container/manager';

/**
 * Manages the selected target for each Avocado project.
 * The target is used for CLI commands and exported to terminal shells.
 */
export class TargetManager implements vscode.Disposable {
    private selectedTargets: Map<string, string> = new Map(); // folderPath -> target
    private readonly _onTargetChanged = new vscode.EventEmitter<{ project: AvocadoProject; target: string }>();
    readonly onTargetChanged = this._onTargetChanged.event;
    private statusBarItem: vscode.StatusBarItem;

    constructor(
        private configWatcher: AvocadoConfigWatcher,
        private containerManager: ContainerManager
    ) {
        // Create status bar item
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'avocado.selectTarget';
        this.statusBarItem.tooltip = 'Click to select Avocado target';
        this.updateStatusBar();
    }

    /**
     * Get the selected target for a project
     */
    getTarget(project: AvocadoProject): string | undefined {
        return this.selectedTargets.get(project.workspaceFolder.uri.fsPath);
    }

    /**
     * Set the target for a project
     */
    setTarget(project: AvocadoProject, target: string): void {
        const folderPath = project.workspaceFolder.uri.fsPath;
        this.selectedTargets.set(folderPath, target);
        this._onTargetChanged.fire({ project, target });
        this.updateStatusBar();
        vscode.window.showInformationMessage(`Avocado target set to: ${target}`);
    }

    /**
     * Show quick pick to select a target
     */
    async selectTarget(project?: AvocadoProject): Promise<string | undefined> {
        // If no project specified, let user pick one first
        if (!project) {
            const projects = this.configWatcher.getProjects();
            if (projects.length === 0) {
                vscode.window.showWarningMessage('No Avocado projects found in workspace');
                return undefined;
            }

            if (projects.length === 1) {
                project = projects[0];
            } else {
                const projectItems = projects.map(p => ({
                    label: p.name,
                    description: this.getTarget(p) || 'no target selected',
                    project: p
                }));

                const selectedProject = await vscode.window.showQuickPick(projectItems, {
                    placeHolder: 'Select project to configure target'
                });

                if (!selectedProject) {
                    return undefined;
                }
                project = selectedProject.project;
            }
        }

        // Get available targets from the volume
        const folderPath = project.workspaceFolder.uri.fsPath;
        let targets: string[];

        try {
            targets = await this.containerManager.getTargetsForFolder(folderPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get targets: ${error}`);
            return undefined;
        }

        if (targets.length === 0) {
            vscode.window.showWarningMessage(
                'No targets found in volume. Run "avocado install" first.'
            );
            return undefined;
        }

        // Build quick pick items
        const currentTarget = this.getTarget(project);
        const items = targets.map(target => ({
            label: target,
            description: target === currentTarget ? '(current)' : '',
            picked: target === currentTarget
        }));

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: `Select target for ${project.name}`
        });

        if (selection) {
            this.setTarget(project, selection.label);
            return selection.label;
        }

        return undefined;
    }

    /**
     * Get environment variables for terminals, including AVOCADO_TARGET
     */
    getTerminalEnv(project: AvocadoProject): Record<string, string> {
        const env: Record<string, string> = {};
        const target = this.getTarget(project);
        if (target) {
            env['AVOCADO_TARGET'] = target;
        }
        return env;
    }

    /**
     * Update the status bar item
     */
    private updateStatusBar(): void {
        const projects = this.configWatcher.getProjects();

        if (projects.length === 0) {
            this.statusBarItem.hide();
            return;
        }

        // For single project, show its target
        if (projects.length === 1) {
            const target = this.getTarget(projects[0]) || 'no target';
            this.statusBarItem.text = `$(target) Avocado: ${target}`;
            this.statusBarItem.show();
            return;
        }

        // For multiple projects, show count of configured targets
        const configuredCount = projects.filter(p => this.getTarget(p)).length;
        this.statusBarItem.text = `$(target) Avocado: ${configuredCount}/${projects.length} targets`;
        this.statusBarItem.show();
    }

    /**
     * Refresh status bar when projects change
     */
    refreshStatusBar(): void {
        this.updateStatusBar();
    }

    dispose(): void {
        this._onTargetChanged.dispose();
        this.statusBarItem.dispose();
    }
}
