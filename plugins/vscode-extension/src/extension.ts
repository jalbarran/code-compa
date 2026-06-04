import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as os from 'os';
import * as QRCode from 'qrcode';

import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { CompanionService } from 'code-compa-proto-ts/src/proto/codecompa/v1/companion_connect';

let sidecarProcess: ChildProcess | null = null;
let sidecarPort: number | null = null;
let sidecarToken: string | null = null;
let restartAttempts = 0;
const maxRestartAttempts = 1;
let sidebarProvider: SidebarProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Compa VS Code extension is active.');

  sidebarProvider = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('code-compa.sidebarView', sidebarProvider)
  );

  const startBridgeCommand = vscode.commands.registerCommand('code-compa.startBridge', () => {
    restartAttempts = 0;
    startSidecar(context);
  });
  context.subscriptions.push(startBridgeCommand);

  // Test command to trigger mock intervention from the command palette
  const triggerMockCommand = vscode.commands.registerCommand('code-compa.triggerMockIntervention', async () => {
    vscode.window.showInformationMessage('Triggering mock intervention...');
    try {
      const result = await vscode.commands.executeCommand('code-compa.requestIntervention', {
        type: 'COMMAND_EXECUTION_REQUEST',
        metadata: { ide: 'Antigravity IDE', agentName: 'Claude-3.5-Sonnet' },
        payload: {
          title: 'Install NPM Packages',
          description: 'The agent requests permission to run npm install on the root.',
          command: 'npm install --force',
          directory: vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '/tmp/dummy-path',
          riskLevel: 'MEDIUM',
          diff: 'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -12,4 +12,5 @@\n   "dependencies": {\n-    "express": "^4.18.2"\n+    "express": "^4.18.2",\n+    "@connectrpc/connect": "^1.4.0"\n   }',
          prompt: 'Integrate connect library dependency'
        }
      });
      vscode.window.showInformationMessage(`Intervention Resolved: ${JSON.stringify(result)}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Intervention Failed: ${err.message || err}`);
    }
  });
  context.subscriptions.push(triggerMockCommand);

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

  // Register telemetry command for testing
  const testTelemetryCommand = vscode.commands.registerCommand('code-compa.testTelemetry', async () => {
    vscode.window.showInformationMessage('Sending test telemetry...');
    await dispatchTelemetryEvent('TEST_EVENT', 'Test Event', 'This is a test telemetry log from VS Code.');
  });
  context.subscriptions.push(testTelemetryCommand);

  // Register command for testing native HITL API prompts (Spec 07 verification)
  const testNativeHITLCommand = vscode.commands.registerCommand('code-compa.testNativeHITL', async () => {
    vscode.window.showInformationMessage('Initiating Native HITL Test...');
    try {
      const choice = await vscode.window.showInformationMessage(
        "¿Confirmas la ejecución de los tests?",
        "Sí, ejecutar",
        "No, cancelar"
      );
      vscode.window.showInformationMessage(`Intercepción completada: ${choice}`);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Error en test de intercepción: ${err.message || err}`);
    }
  });
  context.subscriptions.push(testNativeHITLCommand);

  // Register command for executing commands with risk verification
  const runCommand = vscode.commands.registerCommand('code-compa.runCommand', async (args: {
    command: string;
    directory?: string;
    title?: string;
  }) => {
    const risk = analyzeCommandRisk(args.command);
    if (risk === 'HIGH' || risk === 'MEDIUM') {
      const response: any = await vscode.commands.executeCommand('code-compa.requestIntervention', {
        type: 'COMMAND_EXECUTION_REQUEST',
        payload: {
          title: args.title || 'Execute High-Risk Command',
          description: `An agent requested to run: ${args.command}`,
          command: args.command,
          directory: args.directory || (vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '/tmp'),
          riskLevel: risk,
          allowsTextInput: true
        }
      });

      if (response?.selectedOptionId !== 'APPROVE') {
        throw new Error(`Execution rejected by user: ${response?.feedbackText || 'No feedback provided'}`);
      }
    }

    // Spawn / run in VS Code terminal
    const terminal = vscode.window.createTerminal({
      name: 'Code Compa Agent Execution',
      cwd: args.directory
    });
    terminal.show();
    terminal.sendText(args.command);
    return { success: true };
  });
  context.subscriptions.push(runCommand);

  // Set up observers
  setupTerminalObserver(context);
  setupFileSystemWatcher(context);

  // Auto-start on activation
  startSidecar(context);
}

export function deactivate() {
  stopSidecar();
}

async function dispatchTelemetryEvent(
  type: string,
  title: string,
  description: string,
  extra: Record<string, any> = {}
) {
  try {
    const client = getClient();
    await client.postTelemetryEvent({
      type,
      metadata: {
        ide: 'Antigravity IDE',
        agentName: 'Code-Compa-Watcher',
        timestamp: BigInt(Math.floor(Date.now() / 1000)),
      },
      title,
      description,
      payloadJson: JSON.stringify(extra),
    });
  } catch (err: any) {
    console.error('Failed to post telemetry event:', err.message || err);
  }
}

function analyzeCommandRisk(command: string): 'HIGH' | 'MEDIUM' | 'LOW' {
  const highRiskPatterns = [
    /rm\s+-[rR]*f/,
    /git\s+push\s+.*--force/,
    /npm\s+publish/,
    /docker-compose\s+down/
  ];
  const mediumRiskPatterns = [
    /npm\s+install/,
    /pip\s+install/,
    /db:migrate/,
    /chmod\s+/
  ];

  for (const regex of highRiskPatterns) {
    if (regex.test(command)) {
      return 'HIGH';
    }
  }

  for (const regex of mediumRiskPatterns) {
    if (regex.test(command)) {
      return 'MEDIUM';
    }
  }

  return 'LOW';
}

function setupTerminalObserver(context: vscode.ExtensionContext) {
  if ('onDidStartTerminalShellExecution' in (vscode.window as any)) {
    context.subscriptions.push(
      (vscode.window as any).onDidStartTerminalShellExecution(async (event: any) => {
        const commandLine = event.execution.commandLine.value;
        const directory = event.shellIntegration?.cwd?.fsPath || '';
        await dispatchTelemetryEvent('TERMINAL_COMMAND_STARTED', 'Terminal Command Started', `Running: ${commandLine}`, {
          command: commandLine,
          directory,
          riskLevel: analyzeCommandRisk(commandLine)
        });
      })
    );

    context.subscriptions.push(
      (vscode.window as any).onDidEndTerminalShellExecution(async (event: any) => {
        const commandLine = event.execution.commandLine.value;
        const exitCode = event.exitCode ?? 0;
        await dispatchTelemetryEvent('TERMINAL_COMMAND_ENDED', 'Terminal Command Ended', `Finished: ${commandLine} (Exit Code: ${exitCode})`, {
          command: commandLine,
          exitCode
        });
      })
    );
  }
}

function setupFileSystemWatcher(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');

  watcher.onDidCreate(async (uri) => {
    const relPath = vscode.workspace.asRelativePath(uri);
    if (relPath.includes('node_modules') || relPath.includes('.git') || relPath.includes('out') || relPath.includes('bin')) return;
    await dispatchTelemetryEvent('FILE_CREATED', 'File Created', `Created file: ${relPath}`, {
      filePath: relPath
    });
  });

  watcher.onDidChange(async (uri) => {
    const relPath = vscode.workspace.asRelativePath(uri);
    if (relPath.includes('node_modules') || relPath.includes('.git') || relPath.includes('out') || relPath.includes('bin')) return;
    await dispatchTelemetryEvent('FILE_MUTATED', 'File Modified', `Modified file: ${relPath}`, {
      filePath: relPath
    });
  });

  watcher.onDidDelete(async (uri) => {
    const relPath = vscode.workspace.asRelativePath(uri);
    if (relPath.includes('node_modules') || relPath.includes('.git') || relPath.includes('out') || relPath.includes('bin')) return;
    await dispatchTelemetryEvent('FILE_DELETED', 'File Deleted', `Deleted file: ${relPath}`, {
      filePath: relPath
    });
  });

  context.subscriptions.push(watcher);
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

  const env = { ...process.env };
  if (context.extensionMode === vscode.ExtensionMode.Development) {
    env.CODE_COMPA_ENV = 'development';
  }

  sidecarProcess = spawn(binPath, ['-workspace-path', workspacePath], { env });

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
            sidebarProvider.updateContent();
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
            sidebarProvider.updateContent();
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
  if (sidebarProvider) {
    sidebarProvider.updateContent();
  }
}

function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const interfaceName in interfaces) {
    const addresses = interfaces[interfaceName];
    if (addresses) {
      for (const address of addresses) {
        if (address.family === 'IPv4' && !address.internal) {
          return address.address;
        }
      }
    }
  }
  return '127.0.0.1';
}

class SidebarProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    this.updateContent();
  }

  public async updateContent() {
    if (!this._view) {
      return;
    }

    const webview = this._view.webview;
    if (!sidecarPort || !sidecarToken) {
      webview.html = this.getHtmlForWaiting();
      return;
    }

    try {
      const ip = getLocalIPAddress();
      const payload = { ip, port: sidecarPort, token: sidecarToken };
      const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload));
      webview.html = this.getHtmlForCredentials(ip, sidecarPort, sidecarToken, qrDataUrl);
    } catch (err: any) {
      webview.html = this.getHtmlForError(err.message || err);
    }
  }

  private getHtmlForWaiting(): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { font-family: sans-serif; padding: 20px; color: var(--vscode-foreground); }
        .spinner { margin: 20px auto; border: 4px solid rgba(0,0,0,0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #2563EB; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .text { text-align: center; font-size: 14px; color: var(--vscode-descriptionForeground); }
      </style>
    </head>
    <body>
      <div class="spinner"></div>
      <div class="text">Waiting for Code Compa Bridge to start...</div>
    </body>
    </html>`;
  }

  private getHtmlForCredentials(ip: string, port: number, token: string, qrDataUrl: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { font-family: sans-serif; padding: 16px; color: var(--vscode-foreground); display: flex; flex-direction: column; align-items: center; }
        h3 { margin-bottom: 8px; font-weight: 600; text-align: center; }
        .description { font-size: 12px; color: var(--vscode-descriptionForeground); text-align: center; margin-bottom: 20px; line-height: 1.4; }
        .qr-container { background: white; padding: 12px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); margin-bottom: 20px; display: flex; justify-content: center; align-items: center; }
        .qr-img { width: 180px; height: 180px; }
        .info-card { width: 100%; border-radius: 6px; background: var(--vscode-textBlockCode-background); border: 1px solid var(--vscode-widget-border); padding: 12px; box-sizing: border-box; }
        .info-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px; }
        .info-row:last-child { margin-bottom: 0; }
        .label { font-weight: bold; color: var(--vscode-descriptionForeground); }
        .value { font-family: monospace; color: var(--vscode-textPreformat-foreground); }
      </style>
    </head>
    <body>
      <h3>Pair Companion App</h3>
      <div class="description">Scan this QR code with the Code Compa mobile app to establish a secure connection.</div>
      <div class="qr-container">
        <img class="qr-img" src="${qrDataUrl}" alt="QR Code" />
      </div>
      <div class="info-card">
        <div class="info-row">
          <span class="label">IP Address:</span>
          <span class="value">${ip}</span>
        </div>
        <div class="info-row">
          <span class="label">Port:</span>
          <span class="value">${port}</span>
        </div>
        <div class="info-row">
          <span class="label">Token:</span>
          <span class="value">${token === 'XXX' ? 'XXX' : token.substring(0, 8) + '...'}</span>
        </div>
      </div>
    </body>
    </html>`;
  }

  private getHtmlForError(error: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
      <style>
        body { font-family: sans-serif; padding: 20px; color: var(--vscode-errorForeground); }
        .title { font-weight: bold; margin-bottom: 8px; }
      </style>
    </head>
    <body>
      <div class="title">Error Generating QR Code</div>
      <div>${error}</div>
    </body>
    </html>`;
  }
}
