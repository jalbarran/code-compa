# Spec 01: Go Bridge Sidecar (Universal Core)

This specification defines the behavior, lifecycle, IPC communication protocol, and execution/permission requirements of the Go Bridge sidecar process (`packages/bridge-go`).

---

## 1. Overview & Goal

The **Go Bridge** is a local background process (sidecar) spawned by the IDE extension (VS Code / Cursor). It acts as the orchestration layer between the IDE plugin and the Mobile Companion application.

### Key Objectives:
- Expose a local **Connect-RPC server** using the HTTP/1.1 or HTTP/2 protocol.
- Resolve the host machine's active LAN IP to allow mobile devices to discover and connect to the local server.
- Manage lockfiles to prevent duplicate background processes running on the same workspace.
- Enforce secure access on the local network via single-session bearer token authentication.

---

## 2. Sidecar Lifecycle & Management

### 2.1. Startup & Port Allocation
1. When the IDE extension is activated, it resolves the platform-specific path of the compiled Go binary.
2. The IDE extension spawns the binary as a child process.
3. On startup, the sidecar scans for an open TCP port starting from `8765`. If `8765` is busy, it increments the port number (e.g., `8766`, `8767`) until it binds successfully.
4. Once the port is bound, the sidecar immediately writes its configuration to `stdout` in the following format:
   ```json
   {"port": 8765, "token": "a1b2c3d4-e5f6-7a8b-9c0d-ef1234567890", "status": "READY"}
   ```
5. The IDE extension reads the first line of `stdout`, parses the JSON object to retrieve the `port` and the `token`, and configures its local Connect client.

### 2.2. Single-Instance Locking (Lockfile)
To avoid port conflicts and redundant processes across multiple IDE windows of the same workspace, the sidecar maintains a lockfile:
- **Path:** `{tmp}/code-compa-{workspaceHash}.lock` where `{tmp}` is the OS temporary directory, and `{workspaceHash}` is a SHA-256 hash of the absolute path of the current workspace/project.
- **Content:** A JSON structure containing the process's PID and the allocated port:
  ```json
  {"pid": 12345, "port": 8765}
  ```
- **Logic:**
  1. On startup, the sidecar checks if the lockfile already exists.
  2. If it exists, it reads the PID and verifies if that process is still active.
  3. If the process is active, the sidecar writes the active port configuration to `stdout` and exits immediately with code `0`. The IDE extension will detect this and connect to the existing port.
  4. If the process is dead, the sidecar removes the stale lockfile, allocates a new port, and writes the new lockfile.

### 2.3. Graceful Shutdown & Zombie Prevention
- **Termination Signal:** The IDE extension sends a `SIGTERM` signal to the sidecar upon window close or extension deactivation.
- **Handling:** The Go sidecar traps `SIGTERM`. It stops accepting new connections, completes ongoing requests, deletes its lockfile, and exits cleanly within 3 seconds.
- **Zombie Detection:** If the IDE process is killed abruptly (`SIGKILL`), the lockfile remains. Upon the next start, the sidecar verifies the PID; if it is not running, it automatically overrides the lockfile.

### 2.4. Crash Recovery
- If the sidecar exits unexpectedly (non-zero code) during an active IDE session, the IDE extension implements a **1-second cooldown** and attempts **one automatic restart**.
- If the restart fails, the IDE extension notifies the user with an error prompt: `"Code Compa Bridge failed to start. [Restart Bridge]"`.

---

## 3. Permissions & Execution

Since extension marketplaces packages are distributed as zip/vsix bundles, execution flags (`+x`) are frequently lost on macOS and Linux.

- **Explicit Chmod:** Before spawning the binary, the IDE extension must programmatically verify and grant execution permissions:
  - **VS Code (Node.js):**
    ```typescript
    import * as fs from 'fs';
    try {
      fs.chmodSync(goBinaryPath, '755');
    } catch (err) {
      console.error('Failed to set execution permissions:', err);
    }
    ```
  - **JetBrains (Kotlin/Java):**
    ```kotlin
    val file = File(goBinaryPath)
    if (!file.canExecute()) {
      file.setExecutable(true, false)
    }
    ```

---

## 4. Local Network Discovery & Security

### 4.1. Local IP Resolution (UDP Dial Test)
To provide the mobile companion with a route to connect, the sidecar resolves its active local IP address.
- It performs a dry UDP connection to public DNS (e.g. `8.8.8.8:80`).
- Because UDP is connectionless, this does not transmit any packets over the internet. Instead, it prompts the operating system to return the primary local network interface IP (e.g., `192.168.1.5`).

### 4.2. QR Code Payload
The IDE extension displays a QR code containing the connection metadata:
```json
{
  "ip": "192.168.1.5",
  "port": 8765,
  "token": "a1b2c3d4-e5f6-7a8b-9c0d-ef1234567890"
}
```

### 4.3. Bearer Token Security
- Every incoming HTTP request from the Mobile App (Expo) or the IDE must include the token in the `Authorization` header:
  ```http
  Authorization: Bearer a1b2c3d4-e5f6-7a8b-9c0d-ef1234567890
  ```
- The Go sidecar uses a Connect interceptor / middleware to validate this token. Requests with missing or invalid tokens are rejected immediately with a `401 Unauthorized` / `Unauthenticated` status.

---

## 5. Communication Protocol (IPC & LAN)

The Go Bridge serves two distinct clients: the local IDE extension (IPC) and the mobile companion (LAN). Both interactions use **Connect-RPC** generated code.

### 5.1. Protocol Definition
The services are defined in `proto/codecompa/v1/companion.proto`.
- **Unary Calls:** For discrete request/response actions (e.g., `RespondToIntervention`).
- **Server-Streaming Calls:** For real-time event updates and telemetry logs pushed to the mobile app (`StreamAgentEvents`).

---

## 6. Verification & Success Criteria

To verify compliance with this specification, the following checks must pass:

### 6.1. Dynamic Port Allocation Test
- Start two separate Go Bridge processes with different workspace hashes.
- Verify that the first starts on port `8765` and the second starts on `8766`.
- Verify that both print their port configurations in JSON format to `stdout`.

### 6.2. Lockfile Test
- Start one Go Bridge process. Verify that `{tmp}/code-compa-{workspaceHash}.lock` is created.
- Start a second Go Bridge process with the **same** workspace hash.
- Verify that the second process prints the port of the first process to `stdout` and exits immediately with code `0`.

### 6.3. Interceptor Security Test
- Make a POST request to `/codecompa.v1.CompanionService/StreamAgentEvents` without an `Authorization` header.
- Verify that the server responds with a `401 Unauthorized` / `Unauthenticated` status code.
- Make the same request with the correct `Authorization: Bearer <token>` header. Verify that the server establishes a valid connection or stream.

### 6.4. Shutdown Test
- Send a `SIGTERM` to the Go Bridge.
- Verify that the process exits within 3 seconds and that the lockfile `{tmp}/code-compa-{workspaceHash}.lock` is deleted.
