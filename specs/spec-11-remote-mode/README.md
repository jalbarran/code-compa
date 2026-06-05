# Spec 11: Remote Mode Configuration and Toggle

This spec defines the behavior, user flow, and implementation details for dynamically enabling and disabling the **Remote Mode** of the Code Compa VS Code extension.

## 1. Goal & Requirements

- Provide a VS Code command/setting toggle to enable or disable Remote Mode.
- **Remote Mode ON (Active)**:
  - Agent and HITL redirection is active (redirecting standard dialogs/prompts to the companion app).
  - The `code-compa` server configuration is registered in target MCP configuration files (Antigravity/Gemini, Claude Desktop, Cline, Roo Code).
- **Remote Mode OFF (Inactive)**:
  - Redirection is completely bypassed; the agent communicates with the developer directly via standard IDE prompts, without forwarding prompts to the companion app.
  - The `code-compa` server registration is automatically removed/unregistered from MCP configuration files (such as `mcp_config.json`, `claude_desktop_config.json`, etc.).
- The Remote Mode state must be persistent across VS Code restarts.
- The state should be visually indicated and toggleable in the VS Code sidebar view.

## 2. Implementation Approach

### 2.1. Extension State & VS Code Context
- Store the state in VS Code's `context.globalState` under the key `code-compa.remoteModeEnabled`.
- Default value: `true` (Active).
- Expose a context key `code-compa.remoteModeEnabled` for use in package.json/menus if needed.

### 2.2. Interception Redirection Change
- Modify `shouldRedirectToMobile()`:
  ```typescript
  function shouldRedirectToMobile(context: vscode.ExtensionContext): boolean {
    const isRemoteEnabled = context.globalState.get<boolean>('code-compa.remoteModeEnabled', true);
    return isRemoteEnabled && !!sidecarPort && !!sidecarToken;
  }
  ```

### 2.3. MCP Configuration Lifecycle
- When Remote Mode is **enabled**:
  - Automatically call `registerMcpServerAutomatically(workspacePath, binPath)`.
- When Remote Mode is **disabled**:
  - Automatically call a new function `unregisterMcpServerAutomatically(workspacePath)`. This function parses `mcp_config.json`, removes the `code-compa` entry from `mcpServers`, and writes it back. It does the same for Claude Desktop, Cline, and Roo Code configurations.

### 2.4. Sidebar Webview Toggle
- Update the VS Code Webview sidebar to show a status toggle or checkbox button:
  - If active: "Remote Mode: ACTIVE" with a button to deactivate.
  - If inactive: "Remote Mode: INACTIVE" with a button to activate.
- Communicate state changes between the extension and the Webview using `postMessage` and `onDidReceiveMessage`.

## 3. Verification & Success Criteria

1. **Remote Mode Toggle**:
   - Toggling the state to INACTIVE immediately cleans up `code-compa` from `~/.gemini/config/mcp_config.json`.
   - Redirection of VS Code dialog prompts falls back to standard IDE prompts immediately.
   - Toggling the state back to ACTIVE registers `code-compa` back into `mcp_config.json` and starts redirecting prompts to the companion app.
