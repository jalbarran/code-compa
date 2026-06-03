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
- **Spec Format:** Within its directory, the spec should contain Markdown documentation (`README.md` or similar) or JSON Schema files. They must describe:
  - The feature's target behavior and user flow.
  - The API, WebSocket payloads, or IPC messaging contracts.
  - Verification guidelines.

---

## 2. Codebase Architecture Rules

### 2.1. Shared Core & Sidecar Strategy
- The IDE plugins must remain as thin as possible (TypeScript / Kotlin). Do not implement heavy networking, discovery, or complex state logic inside the IDE plugin.
- All core logic (local WebSocket server, discovery, cloud relay connectivity, and network management) must live in the Go sidecar (`packages/bridge-go`).
- IDE extensions communicate with the Go sidecar via local IPC (Stdin/Stdout or gRPC).

### 2.2. Mobile App (Expo Go)
- We use standard **Expo Go** for mobile development.
- **No custom native builds:** Do not introduce native library dependencies that require custom native builds (like Expo Development Builds or ejecting) unless explicitly approved.
- Use `Zustand` for React Native state management.

### 2.3. Git & Binary Exclusions
- **NEVER commit compiled binaries** (such as Go executables or built `.vsix` packages) to Git.
- Verify that compiled targets are ignored in `.gitignore`.
- Place any temporary scripts or local test tools under a `scratch/` directory (if temporary) and do not commit them.

## 3. Communication Protocol

- All network and IPC communication must follow the Connect-RPC service definitions defined in `.proto` files inside the specifications directory (e.g. under `specs/`).
- Never write hand-crafted WebSockets or custom JSON parsers. Always use the generated Connect clients and handlers for both Go and TypeScript.
- Any modification to APIs or event payloads must start by updating the corresponding Protocol Buffers file first, then regenerating the Go and TypeScript stubs to avoid contract drift.
