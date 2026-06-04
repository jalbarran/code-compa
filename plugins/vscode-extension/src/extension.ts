import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';

import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { CompanionService } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_connect';

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

  // Register command for AI Agents to request intervention
  const requestInterventionCommand = vscode.commands.registerCommand('code-compa.requestIntervention', async (payload: {
    type?: string;
    metadata?: {
      ide?: string;
      agentName?: string;
      timestamp?: number;
    };
    payload: {
      title: string;
      description?: string;
      command?: string;
      directory?: string;
      riskLevel?: string;
      diff?: string;
      prompt?: string;
      options?: Array<{ id: string; label: string }>;
      allowsTextInput?: boolean;
    };
  }) => {
    try {
      const client = getClient();
      const response = await client.requestIntervention({
        type: payload.type || 'COMMAND_EXECUTION_REQUEST',
        metadata: {
          ide: payload.metadata?.ide || 'VS Code',
          agentName: payload.metadata?.agentName || 'AI Agent',
          timestamp: BigInt(payload.metadata?.timestamp || Math.floor(Date.now() / 1000)),
        },
        payload: {
          title: payload.payload?.title || 'Intervention Requested',
          description: payload.payload?.description || '',
          command: payload.payload?.command || '',
          directory: payload.payload?.directory || '',
          riskLevel: payload.payload?.riskLevel || 'LOW',
          diff: payload.payload?.diff || '',
          prompt: payload.payload?.prompt || '',
          options: (payload.payload?.options || []).map(opt => ({
            id: opt.id,
            label: opt.label,
          })),
          allowsTextInput: payload.payload?.allowsTextInput ?? true,
        }
      });
      return {
        selectedOptionId: response.selectedOptionId,
        feedbackText: response.feedbackText,
      };
    } catch (err: any) {
      console.error('RequestIntervention error:', err);
      vscode.window.showErrorMessage(
        vscode.l10n.t("Failed to communicate with Code Compa bridge: {0}", err.message || err)
      );
      throw err;
    }
  });
  context.subscriptions.push(requestInterventionCommand);

  // Auto-start on activation
  startSidecar(context);
}

export function deactivate() {
  stopSidecar();
}

function getClient() {
  if (!sidecarPort || !sidecarToken) {
    throw new Error('Sidecar bridge is not running or credentials are not loaded');
  }
  const transport = createConnectTransport({
    baseUrl: `http://localhost:${sidecarPort}`,
    httpVersion: '1.1',
    interceptors: [
      (next) => async (req) => {
        req.header.set('Authorization', `Bearer ${sidecarToken}`);
        return next(req);
      }
    ]
  });
  return createPromiseClient(CompanionService, transport);
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

function getLockfilePath(): string {
  const hash = getWorkspaceHash();
  const tmpDir = process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return path.join(tmpDir, `code-compa-${hash}.lock`);
}

function readLockfile(): { port: number; token: string } | null {
  try {
    const lockPath = getLockfilePath();
    if (fs.existsSync(lockPath)) {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (data.port && data.token) {
        return { port: data.port, token: data.token };
      }
    }
  } catch (err) {
    console.error('Failed to read lockfile:', err);
  }
  return null;
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
      vscode.l10n.t("Code Compa sidecar binary not found at: {0}. Please build it first.", binPath)
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
          
          if (config.status === 'READY') {
            sidecarToken = config.token || sidecarToken;
            vscode.window.showInformationMessage(
              vscode.l10n.t("Code Compa Bridge started successfully on port {0}", sidecarPort!)
            );
            restartAttempts = 0; // reset on success
          } else if (config.status === 'ALREADY_RUNNING') {
            // Read port & token from lockfile
            const lockData = readLockfile();
            if (lockData) {
              sidecarPort = lockData.port;
              sidecarToken = lockData.token;
            }
            vscode.window.showInformationMessage(
              vscode.l10n.t("Code Compa Bridge is already running for this workspace on port {0}. Reusing instance.", sidecarPort!)
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
    const restartAction = vscode.l10n.t("Restart Bridge");
    vscode.window.showErrorMessage(
      vscode.l10n.t("Code Compa Bridge failed to start or crashed repeatedly."),
      restartAction
    ).then((choice) => {
      if (choice === restartAction) {
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
