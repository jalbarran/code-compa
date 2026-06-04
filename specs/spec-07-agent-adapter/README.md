# Spec 07: Agent Chat Adapter

This specification defines how **Code Compa** intercepts, processes, and streams the interactive conversation, system prompts, planning steps, and thinking processes of AI agents (e.g., Gemini, Claude) running inside VS Code / Antigravity IDE, displaying them in a dedicated real-time view in the Mobile Companion application.

---

## 1. Overview & Goal

To provide a complete "Human-in-the-loop" experience, the developer needs to monitor not only execution commands and file changes, but also the high-level conversation, thought processes, and plan progression of the agent.

### Key Objectives:
- Capture user prompts sent to the IDE agent in real-time.
- Capture the agent's internal thought processes (thinking states) and step planning.
- Stream the agent's Markdown responses incrementally.
- Provide a responsive Chat Timeline UI on the Mobile Companion.

---

## 2. Conversation Interception Hooking

Depending on the IDE agent's implementation, Code Compa supports two interception strategies:

### 2.1. VS Code Chat Participant API (Standard/Native)
For extensions that register a native chat participant (`vscode.ChatParticipant`), the Code Compa extension intercepts conversation payloads using the VS Code Chat API:

```typescript
import * as vscode from 'vscode';

export function setupChatObserver(context: vscode.ExtensionContext) {
  // Hook into active chat agents
  if ('chat' in (vscode as any)) {
    // Intercept chat request/response cycles
    context.subscriptions.push(
      (vscode as any).chat.onDidPerformUserChatRequest(async (request: any) => {
        await dispatchTelemetryEvent('AGENT_PROMPT_RECEIVED', 'User Prompt', request.prompt, {
          prompt: request.prompt,
          participantId: request.participantId
        });
      })
    );
  }
}
```

### 2.2. Custom Agent Adaptor API
For agents executing autonomously (like Claude Code running in a terminal or custom extensions), Code Compa exposes a generic adapter command `code-compa.postAgentState`:

```typescript
vscode.commands.registerCommand('code-compa.postAgentState', async (event: {
  state: 'THINKING' | 'MESSAGE' | 'PLAN_STEP';
  content: string;
  metadata?: Record<string, any>;
}) => {
  let eventType = 'AGENT_TELEMETRY';
  if (event.state === 'THINKING') eventType = 'AGENT_THINKING_STARTED';
  else if (event.state === 'MESSAGE') eventType = 'AGENT_RESPONSE_STREAM';
  else if (event.state === 'PLAN_STEP') eventType = 'AGENT_PLAN_STEP';

  await dispatchTelemetryEvent(eventType, 'Agent Update', event.content, event.metadata || {});
});
```

---

## 3. Conversational Event Schema

Conversational events are wrapped inside `PostTelemetryEventRequest` and sent to the Go bridge sidecar:

### 3.1. User Prompt (`AGENT_PROMPT_RECEIVED`)
- **Title:** "User Prompt"
- **Description:** The text prompt typed by the developer.
- **PayloadJson:** `{"prompt": "string"}`

### 3.2. Thinking State (`AGENT_THINKING_STARTED` / `AGENT_THINKING_ENDED`)
- **Title:** "Agent Thought Process"
- **Description:** Details of what the model is currently analyzing (e.g. "Scanning files", "Generating implementation plan").

### 3.3. Planning Steps (`AGENT_PLAN_STEP`)
- **Title:** "Plan Progress"
- **Description:** Bullet point status of the plan.
- **PayloadJson:** `{"stepIndex": 1, "stepCount": 5, "label": "Run migration", "status": "PENDING | RUNNING | COMPLETED"}`

### 3.4. Response Stream Chunk (`AGENT_RESPONSE_STREAM`)
- **Title:** "Agent Chat Response"
- **Description:** Markdown output text chunks from the LLM.
- **PayloadJson:** `{"text": "string", "isFinal": boolean}`

---

## 4. Mobile Companion Chat UI (Tamagui)

In the Mobile App, we add a **"Chat Timeline"** tab to the Dashboard.

### 4.1. Layout Hierarchy
- **Header:** Shows connection status and target agent information.
- **Timeline Scroll View:**
  - **User Bubble:** Clean right-aligned speech bubble displaying the prompt (`$blue10` background, white text).
  - **Agent Response Bubble:** Left-aligned speech bubble with a card border, rendering Markdown response text.
  - **Thinking Status Card:** If the agent is in a `THINKING` state:
    - Display a loading spinner next to a text label (e.g., *"Agent is thinking: Scanning imports..."*).
  - **Plan Progress Tracker:**
    - Displays a checklist indicating the current progress of the agent (e.g., `[x] Step 1`, `[/] Step 2`, `[ ] Step 3`).

### 4.2. State Management (Zustand)
- We maintain a `chatHistory: ChatMessage[]` structure in the connection store:
  ```typescript
  interface ChatMessage {
    id: string;
    sender: 'USER' | 'AGENT';
    text: string;
    timestamp: number;
    steps?: Array<{ label: string; status: 'PENDING' | 'RUNNING' | 'COMPLETED' }>;
    isThinking?: boolean;
  }
  ```

---

## 5. Verification & Success Criteria

### 5.1. Command Palette Simulation
1. Launch the Extension Development Host.
2. Execute a test script calling `vscode.commands.executeCommand('code-compa.postAgentState', { state: 'MESSAGE', content: 'Hello! I am preparing the code.' })`.
3. Verify the message bubble appears instantly on the phone screen with the correct text.

### 5.2. Thought & Plan Tracker Test
1. Send a telemetry event of type `AGENT_PLAN_STEP` with step details.
2. Confirm that the Mobile App renders a vertical timeline checklist showing the agent's current step as active/running and previous steps as completed.
3. Send `AGENT_THINKING_STARTED` and verify that a sleek glassmorphic loading spinner card is visible at the bottom of the chat list.
