# Spec 11: Remote Mode Configuration and Toggle

This spec defines the behavior, user flow, and implementation details for dynamically enabling and disabling the **Remote Mode** of the Code Compa VS Code extension and the complete activity channel.

## 1. Goal & Requirements

- Provide a VS Code command/setting toggle to enable or disable Remote Mode.
- Provide toggles underneath the Remote Mode setting to individually toggle notification categories.
- **Remote Mode ON (Active)**:
  - Agent and HITL redirection is active (redirecting standard dialogs/prompts to the companion app).
  - The `code-compa` server configuration is registered in target MCP configuration files (Antigravity/Gemini, Claude Desktop, Cline, Roo Code).
  - Telemetry notifications are sent to the companion app according to user preferences.
- **Remote Mode OFF (Inactive)**:
  - Redirection is completely bypassed; the agent communicates with the developer directly via standard IDE prompts, without forwarding prompts to the companion app.
  - The `code-compa` server registration is automatically removed/unregistered from MCP configuration files (such as `mcp_config.json`, `claude_desktop_config.json`, etc.).
  - Telemetry notifications return immediate success to the agent without calling the companion backend server (no network overhead).
- The Remote Mode state and category settings must be persistent across VS Code restarts (using context global state).
- The state should be visually indicated and toggleable in the VS Code sidebar view.

## 2. Notification Categories & Tooling

### 2.1. Categories
We support 2 main telemetry notification categories:
1. `agent_thinking`: Internal reasoning, planning, architectural analysis, sub-task status updates.
2. `agent_actions`: External interactions such as tool invocations, files read/edited, terminal commands run.

### 2.2. Tool: `notify_agent_step`
To post these updates, the agent uses the `notify_agent_step` tool:
- **Parameters**:
  - `category` (enum: `"agent_thinking" | "agent_actions"`): The notification category.
  - `title` (string): Short summary of the step.
  - `description` (string): Detailed explanation of what the agent is doing.
  - `payload_json` (string, optional): Stringified JSON object containing additional metadata.

## 3. Remote Mode Architecture and Flow Diagrams

### Remote Mode ON Flow
```
Agent Works
  └─► notify_agent_step("Thinking...", category="agent_thinking")
        └─► MCP Server: Read Lockfile (RemoteMode=ON)
              ├─► Category Enabled?
              │     ├─► Yes: Call PostTelemetryEvent RPC ──► Companion Device (renders 🧠)
              │     └─► No: Return skipped success response
```

### Remote Mode OFF Flow
```
Agent Works
  └─► notify_agent_step("Thinking...", category="agent_thinking")
        └─► MCP Server: Read Lockfile (RemoteMode=OFF)
              └─► Return immediate skipped success response (zero network overhead)
```

## 4. Verification & Success Criteria

1. **Remote Mode Toggle**:
   - Toggling the state to INACTIVE immediately cleans up `code-compa` from `mcp_config.json`.
   - Redirection of VS Code dialog prompts falls back to standard IDE prompts immediately.
   - Toggling the state back to ACTIVE registers `code-compa` back into `mcp_config.json` and starts redirecting prompts.
2. **Notification Toggles**:
   - Disabling `agent_thinking` in the sidebar and calling `notify_agent_step` with `category: "agent_thinking"` results in a skipped notification response (`{"status":"skipped","reason":"Category 'agent_thinking' is disabled"}`).
3. **Mobile Display**:
   - Notifications show up on the dashboard with distinct icons (🧠 for `agent_thinking`, ⚡ for `agent_actions`).
   - Horizon chips allow filtering the logs list by category.
