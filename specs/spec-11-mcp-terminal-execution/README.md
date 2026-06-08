# Spec 11: MCP Terminal Command Execution

This specification outlines the architecture, tool definition, and implementation flow to allow external AI agents to request terminal command execution through Code Compa. The execution is approved on the mobile companion application and executed locally by the Go sidecar, returning the output to the agent. This allows a complete command execution flow without requiring the user to manually interact with native IDE/chat prompts.

---

## 1. Goal & User Flow

The objective is to expose a new MCP tool `execute_terminal_command` that allows the agent to run commands on the local machine safely.

### User Flow

1. An AI agent wants to execute a terminal command (e.g., `git status` or `npm run build`).
2. Instead of calling the native IDE `run_command` tool (which prompts in the IDE's local safety dialog), the agent calls the Code Compa MCP tool `execute_terminal_command`.
3. The MCP server translates this call into a Connect-RPC request `RequestIntervention` with type `COMMAND_EXECUTION_REQUEST` and populates the command and directory fields.
4. The user receives a premium prompt on their companion app (mobile/web) displaying the command and folder.
5. The user taps "Approve" (or writes custom feedback and rejects).
6. If approved, the Go sidecar executes the command using the system shell, captures the output, and returns it to the agent via the MCP tool response.
7. If rejected, the MCP tool returns a rejection error.

---

## 2. Tool Definition

The MCP server exposes the following new tool:

### `execute_terminal_command`

- **Parameters:**
  - `command` (string, required): The shell command to execute.
  - `directory` (string, optional): The directory in which to run the command. Defaults to the current workspace root.
  - `criticality` (string, optional): One of `"low"`, `"medium"`, `"high"`.
- **Returns:**
  - `stdout` (string): Standard output of the command.
  - `stderr` (string): Standard error of the command.
  - `exitCode` (number): The process exit code.

---

## 3. Implementation Details

- **Go Sidecar Command Execution**:
  - The Go sidecar's MCP server handler will receive the tool call arguments.
  - It calls the `RequestIntervention` RPC.
  - Upon receiving an `"APPROVE"` choice:
    - On Linux/macOS, it executes the command via `sh -c` (or `cmd.exe /c` on Windows).
    - It captures the combined output (stdout and stderr) and the exit status.
  - If the user rejects, the tool returns a standard response indicating rejection with any feedback provided.
