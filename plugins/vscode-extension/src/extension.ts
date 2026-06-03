import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort: number | null = null;
let sidecarToken: string | null = null;
let restartAttempts = 0;
const maxRestartAttempts = 1;

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Compa VS Code extension is active.');

  const startBridgeCommand = vscode.commands.registerCommand('code-compa.startBridge', () => {
    restartAttempts = 0;
    startSidecar(context);
  });
  context.subscriptions.push(startBridgeCommand);

  // Auto-start on activation
  startSidecar(context);
}

export function deactivate() {
  stopSidecar();
}

function getWorkspaceHash(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspacePath = workspaceFolders && workspaceFolders.length > 0
    ? workspaceFolders[0].uri.fsPath
    : 'no-active-workspace';
  
  return crypto.createHash('sha256').update(workspacePath).digest('hex');
}

function getWorkspacePath(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders && workspaceFolders.length > 0
    ? workspaceFolders[0].uri.fsPath
    : path.join(process.env.HOME || process.env.USERPROFILE || '.', '.code-compa-default');
}

function getBinaryPath(context: vscode.ExtensionContext): string {
  const platform = process.platform; // 'darwin', 'win32', 'linux'
  let archName: string = process.arch;

  // Map architecture names if needed
  if (archName === 'x64') {
    archName = 'amd64';
  }

  let binaryName = `bridge-${platform}-${archName}`;
  if (platform === 'win32') {
    binaryName = `bridge-windows-${archName}.exe`;
  } else if (platform === 'darwin') {
    binaryName = `bridge-darwin-${archName}`;
  } else {
    binaryName = `bridge-linux-${archName}`;
  }

  // First try absolute/packaged bin path
  let binPath = path.join(context.extensionPath, 'bin', binaryName);

  // Dev fallback (if running locally and binary is in workspace root or build dir)
  if (!fs.existsSync(binPath)) {
    const devPath = path.join(context.extensionPath, '..', '..', 'packages', 'bridge-go', 'bridge');
    if (fs.existsSync(devPath)) {
      binPath = devPath;
    }
  }

  return binPath;
}

function startSidecar(context: vscode.ExtensionContext) {
  stopSidecar();

  const binPath = getBinaryPath(context);
  const workspacePath = getWorkspacePath();

  if (!fs.existsSync(binPath)) {
    vscode.window.showErrorMessage(
      `Code Compa sidecar binary not found at: ${binPath}. Please build it first.`
    );
    return;
  }

  // 1. Chmod +x on UNIX platforms
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binPath, '755');
    } catch (err) {
      console.error(`Failed to set execution permissions on binary: ${err}`);
    }
  }

  // 2. Spawn sidecar child process
  console.log(`Spawning sidecar: ${binPath} -workspace-path ${workspacePath}`);
  sidecarProcess = spawn(binPath, ['-workspace-path', workspacePath]);

  // Buffer for reading the first line of stdout (config JSON)
  let stdoutBuffer = '';

  sidecarProcess.stdout?.on('data', (data) => {
    const chunk = data.toString();
    stdoutBuffer += chunk;

    const newlineIndex = stdoutBuffer.indexOf('\n');
    if (newlineIndex !== -1) {
      const firstLine = stdoutBuffer.substring(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.substring(newlineIndex + 1);

      try {
        const config = JSON.parse(firstLine);
        if (config.port && config.status) {
          sidecarPort = config.port;
          sidecarToken = config.token || sidecarToken;
          
          if (config.status === 'READY') {
            vscode.window.showInformationMessage(
              `Code Compa Bridge started successfully on port ${sidecarPort}`
            );
            restartAttempts = 0; // reset on success
          } else if (config.status === 'ALREADY_RUNNING') {
            vscode.window.showInformationMessage(
              `Code Compa Bridge is already running for this workspace on port ${sidecarPort}. Reusing instance.`
            );
          }
        }
      } catch (err) {
        console.error('Failed to parse stdout config line:', firstLine, err);
      }
    }
  });

  sidecarProcess.stderr?.on('data', (data) => {
    console.error(`[Sidecar Error] ${data.toString()}`);
  });

  sidecarProcess.on('close', (code) => {
    console.log(`Sidecar exited with code ${code}`);
    sidecarProcess = null;

    if (code !== 0 && code !== null) {
      handleSidecarCrash(context);
    }
  });
}

function handleSidecarCrash(context: vscode.ExtensionContext) {
  if (restartAttempts < maxRestartAttempts) {
    restartAttempts++;
    console.log(`Sidecar crashed. Retrying startup (attempt ${restartAttempts}/${maxRestartAttempts}) after 1s...`);
    setTimeout(() => startSidecar(context), 1000);
  } else {
    vscode.window.showErrorMessage(
      'Code Compa Bridge failed to start or crashed repeatedly.',
      'Restart Bridge'
    ).then((choice) => {
      if (choice === 'Restart Bridge') {
        restartAttempts = 0;
        startSidecar(context);
      }
    });
  }
}

function stopSidecar() {
  if (sidecarProcess) {
    console.log('Sending SIGTERM to sidecar process');
    sidecarProcess.kill('SIGTERM');
    sidecarProcess = null;
  }
  sidecarPort = null;
  sidecarToken = null;
}
