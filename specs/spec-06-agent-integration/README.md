# Spec 06: Agent Integration (Phase 4)

This specification defines how **Code Compa** connects real event hooks from the IDE environment (specifically VS Code/Antigravity IDE) to the Go Bridge sidecar, enabling real-time telemetry, terminal command logging, safety guardrails for high-risk executions, and workspace filesystem watch feeds.

---

## 1. Overview & Goal

The objective of Phase 4 is to establish an automatic and active stream of event hooks from the developer's IDE to the Go backend, which in turn relays them to the Mobile Companion app via the existing `StreamAgentEvents` connection.

### Key Objectives:
- **Terminal Execution Observer:** Hook into terminal sessions using native VS Code APIs to capture and stream commands to the mobile dashboard log feed.
- **High-Risk Command Guardrails:** Detect dangerous command patterns (e.g. `rm -rf`, `git push --force`) and trigger a Human-in-the-loop (HITL) blocking verification before they execute, using a custom task runner command.
- **Filesystem Mutation Feed:** Monitor workspace file additions, modifications, and deletions, streaming clean events to show agent activity on the mobile app.
- **Active Agent Session Metadata:** Expose APIs for local autonomous agents (e.g., Claude Code, custom script agents) to automatically register their session state and current goals.

---

## 2. Terminal Execution Observation

VS Code/Antigravity IDE provides the **Terminal Shell Integration API** (introduced in VS Code 1.85+) which allows extensions to safely inspect commands executed inside the terminal.

### 2.1. Observing Terminal Commands
The VS Code extension will listen to the shell execution lifecycle:
```typescript
import * as vscode from 'vscode';

export function setupTerminalObserver(context: vscode.ExtensionContext) {
  // Hook command startup
  context.subscriptions.push(
    vscode.window.onDidStartTerminalShellExecution(async (event) => {
      const commandLine = event.execution.commandLine.value;
      const directory = event.shellIntegration.cwd?.fsPath || '';
      
      // Dispatch log event to Go Sidecar
      await dispatchTelemetryEvent({
        type: 'TERMINAL_COMMAND_STARTED',
        title: 'Command Execution Started',
        description: `Running: ${commandLine}`,
        command: commandLine,
        directory: directory,
        riskLevel: analyzeCommandRisk(commandLine)
      });
    })
  );

  // Hook command completion
  context.subscriptions.push(
    vscode.window.onDidEndTerminalShellExecution((event) => {
      const commandLine = event.execution.commandLine.value;
      const exitCode = event.exitCode;

      dispatchTelemetryEvent({
        type: 'TERMINAL_COMMAND_ENDED',
        title: 'Command Execution Finished',
        description: `Finished: ${commandLine} (Exit Code: ${exitCode})`,
        command: commandLine,
        riskLevel: 'LOW'
      });
    })
  );
}
```

---

## 3. High-Risk Command Interception

Since the native `onDidStartTerminalShellExecution` API is read-only and cannot pause or block execution, **Code Compa** provides a safe execution wrapper command: `code-compa.runCommand`.

### 3.1. Command Interceptor Wrapper
When autonomous agents run shell commands, they should invoke the `code-compa.runCommand` VS Code command instead of launching raw terminal shell commands directly:

```typescript
vscode.commands.registerCommand('code-compa.runCommand', async (args: {
  command: string;
  directory?: string;
  title?: string;
}) => {
  const risk = analyzeCommandRisk(args.command);
  
  if (risk === 'HIGH' || risk === 'MEDIUM') {
    // Trigger blocking HITL approval request
    const response = await vscode.commands.executeCommand('code-compa.requestIntervention', {
      type: 'COMMAND_EXECUTION_REQUEST',
      payload: {
        title: args.title || 'Execute Command',
        description: `An autonomous task requested to execute: ${args.command}`,
        command: args.command,
        directory: args.directory || vscode.workspace.workspaceFolders?.[0].uri.fsPath,
        riskLevel: risk,
        allowsTextInput: true
      }
    });

    // Check intervention outcome
    if (response.selectedOptionId !== 'APPROVE') {
      throw new Error(`Execution rejected by user: ${response.feedbackText || 'No feedback provided'}`);
    }
  }

  // If approved or low-risk, execute the command in a terminal
  return executeInTerminal(args.command, args.directory);
});
```

### 3.2. Risk Assessment Logic (`analyzeCommandRisk`)
Define static analysis patterns to categorize risk level:
- **HIGH:** Matches destructively recursive patterns, force operations, or deployment publishing:
  - `/rm\s+-[rR]*f/`
  - `/git\s+push\s+.*--force/`
  - `/npm\s+publish/`
  - `/docker-compose\s+down/`
- **MEDIUM:** System package mutations, environment configurations, or migrations:
  - `/npm\s+install/`
  - `/pip\s+install/`
  - `/db:migrate/`
  - `/chmod\s+/`
- **LOW:** Standard read-only, informational or build actions (default fallback).

---

## 4. Filesystem Mutation Feed

To provide high-fidelity logging of what the agent is doing to the codebase, the extension monitors file events and streams them as neutral informational events.

### 4.1. Workspace Watcher Setup
Using the VS Code `FileSystemWatcher`:
```typescript
export function setupFileSystemWatcher(context: vscode.ExtensionContext) {
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');

  watcher.onDidCreate((uri) => {
    dispatchTelemetryEvent({
      type: 'FILE_CREATED',
      title: 'File Created',
      description: vscode.workspace.asRelativePath(uri)
    });
  });

  watcher.onDidChange((uri) => {
    // Avoid spamming; filter configuration or use debouncing if needed
    dispatchTelemetryEvent({
      type: 'FILE_MUTATED',
      title: 'File Modified',
      description: vscode.workspace.asRelativePath(uri)
    });
  });

  watcher.onDidDelete((uri) => {
    dispatchTelemetryEvent({
      type: 'FILE_DELETED',
      title: 'File Deleted',
      description: vscode.workspace.asRelativePath(uri)
    });
  });

  context.subscriptions.push(watcher);
}
```

---

## 5. Telemetry Dispatching & Go Protocol Integration

Telemetry logs and file/terminal events are broadcast via a new stream or by queueing lightweight events in the Go bridge sidecar. We expand the `CompanionService` with a unidirectional telemetry log endpoint if necessary, or reuse the `RequestIntervention` structure with an informational status flag.

To keep it lightweight, we send telemetry events to the Go Bridge using standard Unary calls:
```protobuf
// Added to companion.proto
rpc PostTelemetryEvent(PostTelemetryEventRequest) returns (PostTelemetryEventResponse);

message PostTelemetryEventRequest {
  string type = 1; // e.g. "TERMINAL_COMMAND_STARTED", "FILE_CREATED"
  AgentMetadata metadata = 2;
  string title = 3;
  string description = 4;
  string payload_json = 5; // Extra dynamic properties
}

message PostTelemetryEventResponse {
  bool success = 1;
}
```

The Go Bridge maps these requests and broadcasts them downstream to the mobile companion via the active `StreamAgentEvents` server stream, ensuring live updates.

---

## 6. Verification & Success Criteria

To verify compliance with this specification, the following behaviors must be validated:

### 6.1. Terminal Observation Verification
1. Start the VS Code extension and connect to the Go Sidecar.
2. Open a terminal in the IDE and run `ls -la`.
3. Verify that the mobile companion's event log receives a `TERMINAL_COMMAND_STARTED` and a `TERMINAL_COMMAND_ENDED` event showing `ls -la`.

### 6.2. Guardrail Interception Verification
1. Execute the command `code-compa.runCommand` with command `rm -rf node_modules` using a test script.
2. Verify that the command pauses execution and triggers a `COMMAND_EXECUTION_REQUEST` with `riskLevel: HIGH` on the mobile app.
3. Reject the request from the mobile companion. Verify that the promise rejected with `Execution rejected by user`.
4. Run the command again and approve it. Verify that a terminal is spawned executing `rm -rf node_modules`.

### 6.3. Filesystem Mutation Logging
1. Create a file `test_file.txt` in the workspace.
2. Verify that the mobile app dashboard outputs a log card indicating `test_file.txt` was created.
