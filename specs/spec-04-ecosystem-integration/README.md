# Spec 04: Ecosystem and Integration (Phase 3)

This specification defines the integration of the VS Code extension (or other IDE agents) with the Go Bridge sidecar, the expansion of the communication protocol to handle code diffs and prompts, and the corresponding mobile companion UI enhancements.

---

## 1. Overview & Goal

The goal of Phase 3 is to connect real event hooks from the IDE agents/extensions to the Go server and display enriched payloads—specifically **code diffs** and **prompts**—on the mobile companion.

### Key Objectives:
- Expand the Protocol Buffer contract to support code diffs, prompts, and a new IDE-facing `RequestIntervention` RPC.
- Implement token-sharing via the lockfile to support secure multi-instance or late-joining clients.
- Implement the `RequestIntervention` handler in the Go sidecar.
- Register and implement the `code-compa.requestIntervention` VS Code command to expose an API for IDE agents.
- Enhance the mobile app dashboard to render code diffs (with line-by-line colored diff highlighting) and prompts in a pixel-consistent UI across Android and iOS.

---

## 2. Protocol Buffers API Update (`proto/codecompa/v1/companion.proto`)

We add `diff` and `prompt` fields to `AgentPayload`, and add `RequestIntervention` to the `CompanionService` so that the IDE extension can synchronously request human intervention.

```protobuf
syntax = "proto3";

package codecompa.v1;

option go_package = "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1/proto/codecompa/v1;apiv1";

service CompanionService {
  // The mobile app calls this stream to receive real-time events from the AI agent
  rpc StreamAgentEvents(StreamAgentEventsRequest) returns (stream AgentEvent);
  
  // The mobile app responds to a pending human intervention request
  rpc RespondToIntervention(RespondToInterventionRequest) returns (RespondToInterventionResponse);

  // The IDE extension (or local agent) calls this to request human intervention and wait for the response
  rpc RequestIntervention(RequestInterventionRequest) returns (RequestInterventionResponse);
}

message StreamAgentEventsRequest {}

message AgentEvent {
  string event_id = 1;
  string type = 2; // e.g. "COMMAND_EXECUTION_REQUEST"
  AgentMetadata metadata = 3;
  AgentPayload payload = 4;
}

message AgentMetadata {
  string ide = 1;         // e.g. "VS Code"
  string agent_name = 2;  // e.g. "Claude-Code-Agent"
  int64 timestamp = 3;
}

message AgentPayload {
  string title = 1;
  string description = 2;
  string command = 3;
  string directory = 4;
  string risk_level = 5;
  repeated DecisionOption options = 6;
  bool allows_text_input = 7;
  
  // Enriched fields for Phase 3
  string diff = 8;        // Optional: Unified Git diff format
  string prompt = 9;      // Optional: Prompt or system instruction block
}

message DecisionOption {
  string id = 1;
  string label = 2;
}

message RespondToInterventionRequest {
  string event_id = 1;
  string selected_option_id = 2;
  string feedback_text = 3;
}

message RespondToInterventionResponse {
  bool success = 1;
}

message RequestInterventionRequest {
  string type = 1;
  AgentMetadata metadata = 2;
  AgentPayload payload = 3;
}

message RequestInterventionResponse {
  string selected_option_id = 1;
  string feedback_text = 2;
}
```

---

## 3. Sidecar Enhancements (Go Bridge)

### 3.1. Lockfile Token Storage
To allow VS Code extensions or external agents to connect to an already running instance of the sidecar:
- Update `lockfile.LockData` to include the `token` field:
  ```go
  type LockData struct {
      Pid   int    `json:"pid"`
      Port  int    `json:"port"`
      Token string `json:"token"`
  }
  ```
- Store the token when writing the lockfile.
- In `plugins/vscode-extension`, if the sidecar status is `ALREADY_RUNNING`, read the lockfile to retrieve both `port` and `token`.

### 3.2. `RequestIntervention` Implementation
The `RequestIntervention` RPC handler in the Go sidecar must:
1. Accept the incoming payload details.
2. Generate a cryptographically random or unique `event_id` (e.g. `evt-xxxxxx`).
3. Construct the `AgentEvent` message.
4. Call `CompanionServer.QueueEvent(ctx, event)`.
5. Block until `QueueEvent` returns the `RespondToInterventionRequest` from the mobile companion.
6. Return `RequestInterventionResponse` with the user's choices.

---

## 4. VS Code Command API

The extension exposes the VS Code command `code-compa.requestIntervention` so that local extensions or task executors can trigger prompts:

```typescript
// Registers the command
vscode.commands.registerCommand('code-compa.requestIntervention', async (payload: {
  title: string;
  description?: string;
  command?: string;
  directory?: string;
  riskLevel?: string;
  diff?: string;
  prompt?: string;
}) => {
  // 1. Instantiates a Connect-RPC client pointing to localhost:port using the Bearer token.
  // 2. Dispatches RequestIntervention.
  // 3. Awaits and returns the response: { selectedOptionId, feedbackText }
});
```

---

## 5. Mobile Companion UI (Tamagui)

We update `apps/mobile-expo/src/app/dashboard.tsx` to handle the new `diff` and `prompt` properties.

### 5.1. Code Diff Card
- If `payload.diff` is populated:
  - Render a dedicated collapsible or scrollable section with a dark terminal theme.
  - Parse the diff line-by-line.
  - Apply color formatting based on line prefix:
    - Starts with `+`: Render with a subtle green tint background or text.
    - Starts with `-`: Render with a subtle red tint background or text.
    - Starts with `@@`: Render with a subtle cyan/blue tint background.
    - Other lines: Render neutral text.

### 5.2. Prompt Card
- If `payload.prompt` is populated:
  - Render the prompt in a styled callout box with a left border using `$colorMuted` or `$blue10` to visually set it apart.
  - Display with proper font weighting and spacing.

---

## 6. Verification Plan

### 6.1. Protocol & Sidecar Tests
- Run `make proto` and verify that the stubs are compiled correctly without errors.
- Run `go run scratch/test-mock-bridge.go` or equivalent to verify the mock bridge starts.

### 6.2. VS Code Extension Verification
- Launch the VS Code extension in extension development host.
- Programmatically trigger the command `code-compa.requestIntervention` using a scratch script or VS Code terminal execution.
- Verify that the extension establishes the connection to the sidecar, calls the RPC, and waits for approval.

### 6.3. Mobile App Verification
- Open the mobile companion app, scan the connection QR code.
- Trigger an event containing a code diff and a prompt block.
- Verify that the mobile dashboard displays:
  - The command execution card.
  - The diff viewer with color-coded additions/deletions.
  - The prompt box.
- Approve/reject the request and verify that the VS Code caller resolves with the correct output.
