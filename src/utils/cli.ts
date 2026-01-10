import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface CliResult {
    success: boolean;
    stdout: string;
    stderr: string;
    code: number | null;
}

/**
 * Check if avocado CLI is installed and available
 */
export async function isAvocadoInstalled(): Promise<boolean> {
    try {
        await execAsync('avocado --version');
        return true;
    } catch {
        return false;
    }
}

/**
 * Get avocado CLI version
 */
export async function getAvocadoVersion(): Promise<string | undefined> {
    try {
        const { stdout } = await execAsync('avocado --version');
        return stdout.trim();
    } catch {
        return undefined;
    }
}

/**
 * Run an avocado command in the terminal (interactive)
 */
export function runInTerminal(
    args: string[],
    options: {
        name?: string;
        cwd?: string;
        env?: Record<string, string>;
    } = {}
): vscode.Terminal {
    const terminal = vscode.window.createTerminal({
        name: options.name || 'Avocado',
        cwd: options.cwd,
        env: options.env
    });

    terminal.show();
    terminal.sendText(`avocado ${args.join(' ')}`);

    return terminal;
}

/**
 * Run an avocado command and capture output
 */
export async function runCommand(
    args: string[],
    options: {
        cwd?: string;
        timeout?: number;
    } = {}
): Promise<CliResult> {
    return new Promise((resolve) => {
        const process = spawn('avocado', args, {
            cwd: options.cwd,
            shell: true,
            timeout: options.timeout || 60000
        });

        let stdout = '';
        let stderr = '';

        process.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            resolve({
                success: code === 0,
                stdout,
                stderr,
                code
            });
        });

        process.on('error', (error) => {
            resolve({
                success: false,
                stdout,
                stderr: error.message,
                code: null
            });
        });
    });
}

/**
 * Run avocado command with progress indicator
 */
export async function runWithProgress<T>(
    title: string,
    task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: false
        },
        task
    );
}

/**
 * Show error message with option to show CLI installation instructions
 */
export async function showCliNotFoundError(): Promise<void> {
    const action = await vscode.window.showErrorMessage(
        'Avocado CLI not found. Please install it to use Avocado DevTools.',
        'View Installation Instructions'
    );

    if (action === 'View Installation Instructions') {
        vscode.env.openExternal(
            vscode.Uri.parse('https://github.com/avocado-linux/avocado-cli#installation')
        );
    }
}

/**
 * Get workspace folder path for CLI commands
 */
export function getWorkspacePath(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
        return folders[0].uri.fsPath;
    }
    return undefined;
}

/**
 * Build common CLI arguments from config
 */
export function buildConfigArgs(configPath?: string, target?: string): string[] {
    const args: string[] = [];
    
    if (configPath) {
        args.push('-C', configPath);
    }
    
    if (target) {
        args.push('--target', target);
    }
    
    return args;
}
