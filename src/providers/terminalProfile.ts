import * as vscode from 'vscode';
import { AvocadoConfigWatcher } from '../utils/config';
import { TargetManager } from '../utils/targetManager';
import { isAvocadoInstalled, showCliNotFoundError, buildConfigArgs } from '../utils/cli';

export class AvocadoTerminalProfileProvider implements vscode.TerminalProfileProvider {
    constructor(
        private configWatcher: AvocadoConfigWatcher,
        private targetManager: TargetManager
    ) {}

    async provideTerminalProfile(
        _token: vscode.CancellationToken
    ): Promise<vscode.TerminalProfile | undefined> {
        // Check if avocado CLI is installed
        const installed = await isAvocadoInstalled();
        if (!installed) {
            await showCliNotFoundError();
            return undefined;
        }

        const projects = this.configWatcher.getProjects();

        if (projects.length === 0) {
            vscode.window.showWarningMessage('No avocado projects found in workspace');
            return undefined;
        }

        // If multiple projects, let user select
        let project = projects[0];
        if (projects.length > 1) {
            const items = projects.map(p => ({
                label: p.name,
                description: this.targetManager.getTarget(p) || 'no target',
                detail: p.configPath,
                project: p
            }));

            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select avocado project for SDK shell'
            });

            if (!selection) {
                return undefined;
            }
            project = selection.project;
        }

        // Get the selected target
        let target = this.targetManager.getTarget(project);

        // If no target selected, prompt user to select one
        if (!target) {
            target = await this.targetManager.selectTarget(project);
            if (!target) {
                vscode.window.showWarningMessage('No target selected. Please select a target first.');
                return undefined;
            }
        }

        // Build the command arguments
        const args = ['sdk', 'run', '-i', '-E'];
        args.push(...buildConfigArgs(project.configPath, target));

        // Get environment variables including AVOCADO_TARGET
        const env = this.targetManager.getTerminalEnv(project);

        // Create terminal options
        const options: vscode.TerminalOptions = {
            name: `Avocado SDK (${project.name}:${target})`,
            shellPath: 'avocado',
            shellArgs: args,
            cwd: project.workspaceFolder.uri.fsPath,
            iconPath: new vscode.ThemeIcon('terminal'),
            message: `Avocado SDK Shell - ${project.name} (${target})`,
            env
        };

        return new vscode.TerminalProfile(options);
    }
}
