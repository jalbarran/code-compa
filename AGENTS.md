# Code Compa - AI Agent Guidelines 🤖

Welcome! If you are an AI agent developer or coding assistant working on **Code Compa**, you must strictly follow the rules, workflows, and architecture defined in this document.

---

## 1. Core Rule: Spec-driven Development (SDD)

Before writing *any* implementation code, you must ensure a specification document exists or create one under the `specs/` directory.

- **Do NOT write code first.** Every new feature, UI component, sidecar task, or protocol exchange must have a corresponding spec.
- **Spec Directory Naming Convention:** Specs must be organized under the `specs/` directory, following a strict numerical prefix order and a short descriptive name.
  - Examples:
    - `specs/spec-01-go-bridge/`
    - `specs/spec-02-ui-toggle/`
- **Spec Format:** Within its directory, the spec should contain Markdown documentation (`README.md` or similar). Specs describe:
  - The feature's target behavior and user flow.
  - References to the Connect-RPC service definitions (`.proto` files live in `proto/`, not inside `specs/`).
  - Verification guidelines and success criteria.

---

## 2. Codebase Architecture Rules

### 2.1. Shared Core & Sidecar Strategy
- The IDE plugins must remain as thin as possible (TypeScript / Kotlin). Do not implement heavy networking, discovery, or complex state logic inside the IDE plugin.
- All core logic (local Connect-RPC server, network discovery, cloud relay connectivity, and network management) must live in the Go sidecar (`packages/bridge-go`).
- IDE extensions communicate with the Go sidecar via local IPC: the plugin spawns the sidecar as a child process and reads the allocated port from its `stdout`. From that point, all communication uses Connect-RPC over `localhost`.

### 2.2. Mobile App (Expo Go)
- We use standard **Expo Go** for mobile development.
- **No custom native builds:** Do not introduce native library dependencies that require custom native builds (like Expo Development Builds or ejecting) unless explicitly approved.
- **Target platforms:** The mobile app must run on **both Android and iOS**. Every screen and component must look and behave identically on both platforms.
- **UI Framework:** Use **Tamagui** exclusively for all UI components and styling. Rules:
  - Do NOT use `Platform.OS === 'android'` or `Platform.OS === 'ios'` checks inside UI components.
  - All design tokens (colors, spacing, typography, radii) must be defined in `tamagui.config.ts` and consumed as tokens — never hardcoded values.
  - Use Tamagui primitives (`Stack`, `XStack`, `YStack`, `Text`, `Button`, `Sheet`, etc.) as the base for all components.
- **State Management:** Use `Zustand` for React Native state management.

### 2.3. Git & Binary Exclusions
- **NEVER commit compiled binaries** (such as Go executables or built `.vsix` packages) to Git.
- Verify that compiled targets are ignored in `.gitignore`.
- Place any temporary scripts or local test tools under a `scratch/` directory (if temporary) and do not commit them.
- **Changesets Tagging**: Every pull request/change to package code must include a changeset tag. You must generate a changeset using `npm run changeset` (or write one under `.changeset/`) when modifying packages.

---

## 3. Communication Protocol

- All network and IPC communication must follow the Connect-RPC service definitions in `.proto` files located in the `proto/` directory at the repo root (e.g. `proto/codecompa/v1/companion.proto`).
- **Never write hand-crafted HTTP handlers, raw WebSockets, or custom JSON parsers.** Always use the generated Connect-RPC clients and handlers for both Go and TypeScript.
- Any modification to APIs or event payloads must start by updating the corresponding `.proto` file first, then regenerating the stubs (see §4), to avoid contract drift between client and server.

---

## 4. Code Generation Workflow

All typed clients and server stubs are generated from `.proto` files using `buf`. This is the single source of truth for the IPC and network API contracts.

### 4.1. Tool: `buf`
- We use [`buf`](https://buf.build) — **do not use `protoc` directly**.
- Configuration lives at the repo root:
  - `buf.yaml` — workspace definition, lint rules, and breaking-change detection.
  - `buf.gen.yaml` — code-generation plugin configuration.

### 4.2. Generation Plugins
| Plugin | Output | Destination |
| :--- | :--- | :--- |
| `protoc-gen-go` | Go message types | `packages/bridge-go/pkg/api/v1/` |
| `protoc-gen-connect-go` | Go server/client stubs | `packages/bridge-go/pkg/api/v1/` |
| `protoc-gen-es` | TypeScript message types | `packages/proto-ts/src/` |
| `@connectrpc/protoc-gen-connect-es` | TypeScript client stubs | `packages/proto-ts/src/` |

### 4.3. How to Regenerate Stubs

Run the following command from the **repo root** after modifying any `.proto` file:

```bash
make proto
```

This is equivalent to running `buf generate` and must be executed before any implementation changes that depend on the updated contract.

### 4.4. Rules for Generated Files
- **Do NOT manually edit** any file inside `packages/bridge-go/pkg/api/v1/` or `packages/proto-ts/src/`. These are machine-generated — manual edits will be overwritten on the next `make proto` run.
- Generated stubs **are committed to Git** so contributors do not need `buf` installed to build the project.
- If you add a new RPC or message, always update the `.proto` file first, run `make proto`, and commit both the `.proto` change and the regenerated stubs together in the same commit.
- Never add business logic inside generated files. Place all custom logic in separate files that import the generated types.

### 4.5. Source of Truth Location
`.proto` files live under `proto/codecompa/v1/` at the repo root. The `specs/` directory contains **only Markdown documentation** — no source code. The canonical file at project start is:

```
proto/codecompa/v1/companion.proto
```

---

## 5. Human-In-The-Loop (HITL) & MCP Usage

When you are acting as an AI assistant in this workspace, you must prioritize using the custom `code-compa` MCP server tools instead of asking the user questions or confirming choices directly in the chat panel, **provided that the `code-compa` MCP server is enabled/registered in the client environment**.

- **Availability Check**: If the `code-compa` MCP server is NOT configured, registered (e.g. absent from `mcp_config.json`), or otherwise unavailable, you MUST silently fall back to standard IDE tools/questions. Act as if the Code Compa extension does not exist at all—do NOT explain, warn, or mention "Code Compa" or the missing MCP server to the developer.
- **Priority**: Always use MCP tools for user interactions when they are available. Do not ask for confirmation or choice via plain text chat if an MCP tool can perform it.
- **Pre-Invocation Chat Message (UX Rule)**: 
  - **CRITICAL**: Before calling any `code-compa` MCP tool (such as `ask_human_choice`, `ask_human_confirmation`, or `ask_human_input`), you **must first** output a brief text message in the chat explaining to the user that they need to review or interact with their **Code Compa** companion app (e.g., *"He enviado una pregunta a tu app de Code Compa..."*).
  - This ensures that the user understands the context and expects to look at their mobile/companion interface, while keeping the tool call and its raw JSON inputs transparently introduced rather than appearing out of nowhere.
- **MCP Tools**:
  - `ask_human_confirmation`: Use for yes/no or confirmation dialogs.
  - `ask_human_choice`: Use when presenting multiple options for selection.
  - `ask_human_input`: Use when open-ended user text input is needed.
  - `execute_terminal_command`: Use when you need to execute system shell commands. **Always use this tool instead of the native IDE terminal/command execution tools** (like `run_command`) to delegate consent to the companion device and prevent native IDE permission prompts. When executed, this tool automatically registers started/ended telemetry notifications to the Code Compa companion application.

