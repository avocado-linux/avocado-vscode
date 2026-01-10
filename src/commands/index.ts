import * as vscode from 'vscode';
import { AvocadoConfigWatcher, AvocadoProject } from '../utils/config';
import { TargetManager } from '../utils/targetManager';
import {
    isAvocadoInstalled,
    showCliNotFoundError,
    runInTerminal,
    buildConfigArgs
} from '../utils/cli';

export function registerCommands(
    context: vscode.ExtensionContext,
    configWatcher: AvocadoConfigWatcher,
    targetManager: TargetManager
): void {
    // Install command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.install', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager, true);
            if (!target) { return; }

            await runAvocadoCommand('install', project, target, targetManager);
        })
    );

    // Build command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.build', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager);
            if (!target) { return; }

            // Get available build targets
            const options: vscode.QuickPickItem[] = [
                { label: 'All', description: 'Build all extensions and runtimes' }
            ];

            // Add extensions
            const extensions = configWatcher.getExtensionNamesForProject(project);
            for (const ext of extensions) {
                options.push({
                    label: `Extension: ${ext}`,
                    description: 'Build single extension',
                    detail: ext
                });
            }

            // Add runtimes
            const runtimes = configWatcher.getRuntimeNamesForProject(project);
            for (const runtime of runtimes) {
                options.push({
                    label: `Runtime: ${runtime}`,
                    description: 'Build single runtime',
                    detail: runtime
                });
            }

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select what to build'
            });

            if (!selection) {
                return;
            }

            const args = ['build'];
            args.push(...buildConfigArgs(project.configPath, target));

            if (selection.label.startsWith('Extension:') && selection.detail) {
                args.push('-e', selection.detail);
            } else if (selection.label.startsWith('Runtime:') && selection.detail) {
                args.push('-r', selection.detail);
            }

            await runAvocadoCommandWithArgs(args, project, targetManager);
        })
    );

    // SDK Shell command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.sdkShell', async () => {
            if (!await checkCli()) { return; }

            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager);
            if (!target) { return; }

            const args = ['sdk', 'run', '-i'];
            args.push(...buildConfigArgs(project.configPath, target));

            // Optionally select extension or runtime context
            const contextOptions: vscode.QuickPickItem[] = [
                { label: 'Default', description: 'Open shell in /opt/src' }
            ];

            const extensions = configWatcher.getExtensionNamesForProject(project);
            for (const ext of extensions) {
                contextOptions.push({
                    label: `Extension: ${ext}`,
                    description: 'Open shell in extension sysroot',
                    detail: ext
                });
            }

            const runtimes = configWatcher.getRuntimeNamesForProject(project);
            for (const runtime of runtimes) {
                contextOptions.push({
                    label: `Runtime: ${runtime}`,
                    description: 'Open shell in runtime sysroot',
                    detail: runtime
                });
            }

            let selection: vscode.QuickPickItem | undefined;
            if (extensions.length > 0 || runtimes.length > 0) {
                selection = await vscode.window.showQuickPick(contextOptions, {
                    placeHolder: 'Select shell context'
                });
                if (!selection) { return; }
            }

            if (selection?.label.startsWith('Extension:') && selection.detail) {
                args.push('-e', selection.detail);
            } else if (selection?.label.startsWith('Runtime:') && selection.detail) {
                args.push('-r', selection.detail);
            }

            runInTerminal(args, {
                name: `Avocado SDK (${project.name}:${target})`,
                cwd: project.workspaceFolder.uri.fsPath,
                env: targetManager.getTerminalEnv(project)
            });
        })
    );

    // Clean command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.clean', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = targetManager.getTarget(project);

            const options: vscode.QuickPickItem[] = [
                {
                    label: 'Clean All',
                    description: 'Remove all volumes and state files',
                    detail: 'clean'
                },
                {
                    label: 'Clean Stamps',
                    description: 'Remove stamp files (allow re-running steps)',
                    detail: 'stamps'
                }
            ];

            // Add extension-specific clean options
            const extensions = configWatcher.getExtensionNamesForProject(project);
            for (const ext of extensions) {
                options.push({
                    label: `Clean Extension: ${ext}`,
                    description: 'Clean single extension sysroot',
                    detail: `ext:${ext}`
                });
            }

            // Add runtime-specific clean options
            const runtimes = configWatcher.getRuntimeNamesForProject(project);
            for (const runtime of runtimes) {
                options.push({
                    label: `Clean Runtime: ${runtime}`,
                    description: 'Clean single runtime installroot',
                    detail: `runtime:${runtime}`
                });
            }

            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select what to clean'
            });

            if (!selection) { return; }

            let args: string[];
            const configArgs = buildConfigArgs(project.configPath, target);

            switch (selection.detail) {
                case 'clean':
                    args = ['clean', '-f'];
                    break;
                case 'stamps':
                    args = ['clean', '--stamps', ...configArgs];
                    break;
                default:
                    if (selection.detail?.startsWith('ext:')) {
                        const extName = selection.detail.substring(4);
                        args = ['ext', 'clean', '-e', extName, ...configArgs];
                    } else if (selection.detail?.startsWith('runtime:')) {
                        const runtimeName = selection.detail.substring(8);
                        args = ['runtime', 'clean', '-r', runtimeName, ...configArgs];
                    } else {
                        return;
                    }
            }

            // Confirm destructive operation
            const confirm = await vscode.window.showWarningMessage(
                `Are you sure you want to run: avocado ${args.join(' ')}?`,
                { modal: true },
                'Yes'
            );

            if (confirm !== 'Yes') { return; }

            await runAvocadoCommandWithArgs(args, project, targetManager);
        })
    );

    // Provision command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.provision', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager);
            if (!target) { return; }

            const runtimes = configWatcher.getRuntimeNamesForProject(project);

            if (runtimes.length === 0) {
                vscode.window.showWarningMessage('No runtimes configured in avocado.yaml');
                return;
            }

            const selection = await vscode.window.showQuickPick(
                runtimes.map(r => ({ label: r })),
                { placeHolder: 'Select runtime to provision' }
            );

            if (!selection) { return; }

            const args = ['provision', '-r', selection.label];
            args.push(...buildConfigArgs(project.configPath, target));

            await runAvocadoCommandWithArgs(args, project, targetManager);
        })
    );

    // Deploy command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.deploy', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager);
            if (!target) { return; }

            const runtimes = configWatcher.getRuntimeNamesForProject(project);

            if (runtimes.length === 0) {
                vscode.window.showWarningMessage('No runtimes configured in avocado.yaml');
                return;
            }

            const runtime = await vscode.window.showQuickPick(
                runtimes.map(r => ({ label: r })),
                { placeHolder: 'Select runtime to deploy' }
            );

            if (!runtime) { return; }

            const device = await vscode.window.showInputBox({
                prompt: 'Enter device IP or hostname',
                placeHolder: '192.168.1.100'
            });

            if (!device) { return; }

            const args = ['deploy', '-r', runtime.label, '-d', device];
            args.push(...buildConfigArgs(project.configPath, target));

            await runAvocadoCommandWithArgs(args, project, targetManager);
        })
    );

    // Fetch command
    context.subscriptions.push(
        vscode.commands.registerCommand('avocado.fetch', async () => {
            const project = await selectProject(configWatcher, targetManager);
            if (!project) { return; }

            const target = await ensureTarget(project, targetManager);
            if (!target) { return; }

            const args = ['fetch'];
            args.push(...buildConfigArgs(project.configPath, target));

            await runAvocadoCommandWithArgs(args, project, targetManager);
        })
    );
}

async function checkCli(): Promise<boolean> {
    const installed = await isAvocadoInstalled();
    if (!installed) {
        await showCliNotFoundError();
        return false;
    }
    return true;
}

async function selectProject(
    configWatcher: AvocadoConfigWatcher,
    targetManager: TargetManager
): Promise<AvocadoProject | undefined> {
    const projects = configWatcher.getProjects();

    if (projects.length === 0) {
        vscode.window.showWarningMessage('No avocado projects found in workspace');
        return undefined;
    }

    // If only one project, use it directly
    if (projects.length === 1) {
        return projects[0];
    }

    // Multiple projects - let user select
    const items = projects.map(p => ({
        label: p.name,
        description: targetManager.getTarget(p) || 'no target',
        detail: p.configPath,
        project: p
    }));

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select avocado project'
    });

    return selection?.project;
}

/**
 * Ensure a target is selected for a project.
 * If allowEmpty is true, we allow commands that don't require a target (like install which sets the target).
 */
async function ensureTarget(
    project: AvocadoProject,
    targetManager: TargetManager,
    allowEmpty: boolean = false
): Promise<string | undefined> {
    let target = targetManager.getTarget(project);

    if (!target && !allowEmpty) {
        // Try to select a target
        target = await targetManager.selectTarget(project);
        if (!target) {
            vscode.window.showWarningMessage('No target selected. Please select a target first.');
            return undefined;
        }
    }

    return target || '';
}

async function runAvocadoCommand(
    command: string,
    project: AvocadoProject,
    target: string,
    targetManager: TargetManager
): Promise<void> {
    if (!await checkCli()) { return; }

    const args = [command, ...buildConfigArgs(project.configPath, target || undefined)];

    runInTerminal(args, {
        name: `Avocado: ${command} (${project.name})`,
        cwd: project.workspaceFolder.uri.fsPath,
        env: targetManager.getTerminalEnv(project)
    });
}

async function runAvocadoCommandWithArgs(
    args: string[],
    project: AvocadoProject,
    targetManager: TargetManager
): Promise<void> {
    if (!await checkCli()) { return; }

    runInTerminal(args, {
        name: `Avocado (${project.name})`,
        cwd: project.workspaceFolder.uri.fsPath,
        env: targetManager.getTerminalEnv(project)
    });
}
