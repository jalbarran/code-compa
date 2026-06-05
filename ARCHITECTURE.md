# Code Compa - Architecture & Design Document

This document defines the global architecture, tech stack, security decisions, and the roadmap for developing **Code Compa**, a decentralized remote control and monitoring ecosystem for AI agents integrated into Integrated Development Environments (IDEs).

---

## 1. Project Vision

**Code Compa** allows developers to maintain supervision and control over their AI agents remotely and locally. The goal is to provide a "Human-in-the-loop" (HITL) intervention channel that operates while the user is away from their desk (e.g., in the kitchen, backyard, or meeting room).

The architecture supports two connection modes, configurable via the IDE plugin:

1. **Option 1: Direct Local Wi-Fi Connection (Default - Offline):** Connects the user's PC and mobile device directly over the local Wi-Fi network. This mode runs entirely Peer-to-Peer without requiring internet access, preserving local-first privacy.
2. **Option 2: Secure Cloud Remote Connection (Premium - Paid):** Connects the PC and mobile device over the internet via a secure cloud relay. This requires internet access and is offered as a paid service. The backend for this mode is hosted in a separate, private repository.

### Fundamental Pillars:

- **Supervised Autonomy:** The agent works autonomously on the developer's PC; the human audits, corrects, or approves requests from their mobile device.
- **Local-First Privacy (by Default):** With Option 1, source code and repository context never leave the user's Local Area Network (LAN).
- **Flexible Connectivity:** The plugin/extension offers a configuration to toggle between Local Wi-Fi and Cloud Remote modes.
- **Multi-IDE Strategy:** An agnostic architecture capable of connecting the same mobile app to the most popular IDEs on the market.
- **Cross-Platform UI Consistency:** The app targets Android, iOS, and Web with a pixel-consistent interface. A single shared UI codebase produces all three versions — no platform-specific divergence in screens, components, or design tokens.
- **Spec-driven Development:** All technical decisions, features, and implementation tasks (e.g. Go sidecar server setup, IDE settings UI toggle) must be fully documented as specifications under the `specs/` directory before writing code. Specs act as the blueprint that implementations must fulfill.

---

## 2. Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Mobile & Web App** | **Expo (React Native)** | Mobile/Web UI, QR code scanning, and telemetry rendering. Targets Android, iOS, and Web browsers from a single codebase. Uses `@connectrpc/connect-web`. |
| **App Routing** | **Expo Router** | File-based routing for Android, iOS, and Web. |
| **UI Framework** | **Tamagui** | Cross-platform design system and component library ensuring a pixel-consistent UI across Android, iOS, and Web. |
| **Universal Bridge** | **Go (Golang)** | High-performance background process (Sidecar), local Connect-RPC server, and network orchestration. |
| **IDE Plugins** | **TypeScript / Kotlin** | Thin native integration layers for each IDE (VS Code, JetBrains). Handles connection settings toggle. |
| **Communication (Local)** | **Connect-RPC (HTTP/JSON)**| Low-latency, strongly-typed channel using unary calls and Server-Streaming over local Wi-Fi / Localhost. |
| **Communication (Cloud)** | **Secure Cloud Tunnel** | Paid/Premium relay service over the internet (Option 2; backend in private repo). |
| **Mobile i18n** | **i18next + react-i18next + expo-localization** | Internationalization library and user locale discovery on Android/iOS. |
| **IDE Plugin i18n** | **@vscode/l10n** | Official VS Code APIs for localization using `.l10n.json` translation bundles. |

---

## 3. System Architecture (Shared Core)

To avoid duplicating network and messaging logic across multiple programming languages, the project adopts the **"Shared Core Strategy"**. The IDE plugins act as simple event emitters, delegating complexity to the unified Go sidecar binary.

```

                   ┌────────────────────────┐
                   │    Mobile App (Expo)   │
                   └───────────▲────────────┘
                               │
            (Local Wi-Fi / Connect-RPC HTTP/JSON)
                               │
                   ┌───────────▼────────────┐
                   │   Go Bridge (Sidecar)  │
                   └───────────▲────────────┘
                               │
            (Localhost HTTP / Connect-RPC / IPC)
                               │
     ┌─────────────────────────┼─────────────────────────┐
     ▼                         ▼                         ▼

┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  VS Code Plugin  │ │ JetBrains Plugin │ │  Cursor Plugin   │
│   (TypeScript)   │ │     (Kotlin)     │ │   (TypeScript)   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

---

## 4. Engineering Decisions

### 4.1. Local-First Connectivity (Connect-RPC)

#### Unified Protocol:
Traditional WebSockets are replaced by **Connect-RPC**. The entire ecosystem (IDE extension, Go Bridge, and Mobile App) shares the same strict contracts defined in Protocol Buffers (`.proto`) files. Connect-RPC automatically generates typed clients and handlers for both Go and TypeScript.

#### Communication Flow:
Connect-RPC runs natively over HTTP (utilizing JSON serialization transparently for web/mobile compatibility), creating a homogeneous API flow:

```
[ IDE Plugin (TS) ]    ───(Connect-RPC over HTTP/2 or Unix Sockets)───► [ Go Bridge (Server) ]
                                                                                ▲
                                                                                │
[ App Mobile (Expo) ]  ──────────(Connect-RPC over HTTP/1.1 JSON)───────────────┘
```

1. **IDE Plugin to Go Bridge (Localhost Inter-Process Connection):**
   - **Mechanism:** The TypeScript plugin acts as a Connect client making calls to the Go bridge acting as a Connect-RPC server on a local port (e.g., `localhost:8080`).
   - **Protocol:** Connect protocol over HTTP. Latency is virtually zero since both processes run on the same machine.
   - **Dynamic Port Allocation:** To avoid port collisions in multi-window workspaces, the Go sidecar dynamically scans and binds to an available free port (starting from `8080`). It then reports the allocated port back to the IDE plugin via stdout or a temporary file.
2. **Mobile App (Expo) to Go Bridge (LAN Connection):**
   - **Mechanism:** The Expo mobile app uses `@connectrpc/connect-web`. After scanning the QR code, it receives the local IP of the PC (e.g., `http://192.168.1.15:8080`).
   - **Protocol:** The mobile app makes standard HTTP POST requests to the Go sidecar. Connect-RPC serializes/deserializes data to JSON transparently, giving the developer a fully typed client interface (e.g., `await client.getPendingTasks({})`).
   - **IP Discovery (UDP Dial Test):** The Go sidecar resolves the active network IP by performing a dummy UDP dial to an external address (e.g., `8.8.8.8:80`). This queries the OS routing table to extract the host IP of the active local Wi-Fi interface without transmitting actual packets.

#### Real-time Events via Server-Streaming:
To push asynchronous telemetry and Human-in-the-loop requests from the Go sidecar to the mobile app without raw WebSockets, Connect-RPC uses **Server-Streaming**:
- The mobile app establishes a persistent connection by calling a streaming RPC (e.g., `StreamAgentEvents`).
- The connection remains open using Server-Sent Events (SSE) or ReadableStreams.
- When an AI agent requires human intervention, the Go server pushes a structured event down the stream. The mobile client processes it, renders the UI, and responds using a standard unary RPC (e.g., `RespondToIntervention`).

#### Connectivity Modes:
- **Option 1 (Default - Local Wi-Fi):** Direct peer-to-peer Connect-RPC communication over local LAN, requiring no internet.
- **Option 2 (Premium - Secure Cloud):** Connects the Go sidecar and mobile app over the internet using a secure cloud relay service (powered by a private backend repository). The IDE plugin provides a settings toggle to switch between modes.

### 4.2. Packaging and Native Execution Permissions

- **Distribution:** The Go code will be cross-compiled (`GOOS` / `GOARCH`) for Windows, macOS, and Linux. The resulting executables will be packaged directly inside the distribution folders of each plugin (`.vsix`, `.jar`, etc.).
- **Git Exclusions (No Binaries in Repo):** To keep the repository lightweight, compiled platform binaries (e.g., the Go executables inside `plugins/vscode-extension/bin/`) must **not** be committed to Git. They should be added to `.gitignore`. Instead, they are generated locally for development or compiled and bundled during the plugin packaging process (e.g., CI/CD packaging).
- **Programmatic Permission Management:** Because extension installers often strip execution permissions on Unix environments, the IDE activation layer (TypeScript or Kotlin) will explicitly grant execution permissions before starting the binary:
  - _In VS Code (TS):_ `fs.chmodSync(goBinaryPath, '755')`
  - _In JetBrains (Kotlin):_ `file.setExecutable(true, false)`
- **Code Signing (Production):** macOS binaries will go through Apple's notarization process (`codesign`) to prevent OS-level blocks (Gatekeeper). Windows binaries will be digitally signed to prevent antivirus false positives.

### 4.3. Mobile & Web App (Expo & Web Client)

- **Expo & Web:** Expo is used to target both native mobile environments (Android/iOS) and web browsers. During development, Expo Go is used for native environments, while standard browser sessions are used for the Web target.
- **Target platforms:** The companion app is built and released for **Android, iOS, and Web**. A single shared Expo/React Native codebase produces all three versions. The web build is exported as static assets and served directly by the Go sidecar.
- **Cleartext HTTP Permission:** To prevent iOS App Transport Security (ATS) or Android cleartext blockages, the Expo app configuration (`app.json`) will be configured to permit cleartext HTTP communication on local IP ranges for both development and production.
- **State Management:** `Zustand` will be used to manage the message queue, pending agent requests, and real-time logs reactively and lightweightly.

### 4.3.1. UI Framework — Tamagui

**Decision:** [Tamagui](https://tamagui.dev) is the exclusive UI framework for all screens and components in the app (`apps/mobile-expo/`).

**Rationale:**
- Tamagui is built specifically for React Native and compiles down to optimized native views (for iOS/Android) and clean semantic HTML/CSS (for Web), ensuring a pixel-consistent interface across **Android, iOS, and Web without any platform-specific component forks**.
- It ships with a fully typed design system (tokens for colors, spacing, typography, radii) that enforces visual consistency at compile time rather than relying on runtime style overrides.
- Performance: Tamagui's compiler flattens styled components into static native views or inline CSS classes, eliminating JS style processing overhead.
- It integrates natively with Expo Router and supports dark/light mode theming out-of-the-box.

**Usage rules:**
1. **No platform-specific UI code.** Do not use `Platform.OS === 'android'`, `'ios'`, or `'web'` checks inside UI components. If a visual difference must exist, it must be expressed through Tamagui's theme/platform token system.
2. **All design tokens** (colors, spacing, font sizes, border radii) must be defined in the Tamagui config (`tamagui.config.ts`) and consumed as tokens — never hardcoded values.
3. **Component library:** Use Tamagui's built-in primitives (`Stack`, `XStack`, `YStack`, `Text`, `Button`, `Sheet`, etc.) as the base for all components. Custom components must be composed from Tamagui primitives.
4. **Theming:** Define a dark theme and a light theme in `tamagui.config.ts`. The app respects the OS-level appearance preference (`useColorScheme`) by default.

**Installation & Build:**
Tamagui works with standard Expo Go on mobile and transpiles clean web outputs. No custom native builds are required.

### 4.4. Protobuf & Code-Generation Tooling

- **Tooling:** We use [`buf`](https://buf.build) to manage and compile Protocol Buffers. `protoc` is **not** used directly.
- **Configuration:** A `buf.yaml` and `buf.gen.yaml` at the repo root configure lint rules, breaking-change detection, and the generation plugins.
- **Plugins used:**
  - `protoc-gen-go` + `protoc-gen-connect-go` → generates Go server stubs into `packages/bridge-go/pkg/api/v1/`.
  - `protoc-gen-es` + `@connectrpc/protoc-gen-connect-es` → generates TypeScript stubs into a shared `packages/proto-ts/` directory, consumed by both the VS Code extension and the Expo app.
- **Source of truth:** All `.proto` files live under `proto/` at the repo root and are referenced by `buf.yaml`. The `specs/` directory contains only Markdown documentation — no source code.
- **Build automation:** A `Makefile` at the repo root exposes a `make proto` target that runs `buf generate`. This is the single command any developer or CI pipeline must run after modifying a `.proto` file.
- **Output placement:**
  ```
  packages/
  ├── bridge-go/pkg/api/v1/   ← generated Go stubs
  └── proto-ts/               ← generated TypeScript stubs (shared)
  ```
- **Rule:** Generated files (`.pb.go`, `*_connect.ts`, etc.) are **committed to Git** so that contributors do not need to install `buf` locally to build the project. They are regenerated only when a `.proto` file changes.

### 4.5. Monorepo Package Management

- **No monorepo manager:** We deliberately avoid Turborepo, pnpm workspaces, or npm workspaces. Subprojects (`apps/mobile-expo`, `packages/bridge-go`, `plugins/vscode-extension`) manage their own dependencies independently.
- **Rationale:** The three technology stacks (Go, Node.js/TypeScript, and Kotlin/Java) have incompatible package ecosystems. A monorepo tool would add overhead without providing real cross-stack benefit given the project's scale.
- **Shared TypeScript stubs:** The only shared artifact between TS subprojects is the generated Connect-RPC code in `packages/proto-ts/`. Each consuming project (`apps/mobile-expo`, `plugins/vscode-extension`) will reference it via a relative path import or a workspace `file:` link—this is the only inter-package dependency.
- **Installation:** Developers run `npm install` inside each directory independently.

### 4.6. Local Network Security (HTTP vs HTTPS)

- **Decision: Plain HTTP with explicit cleartext exceptions.** We do not use self-signed TLS certificates on the local LAN. Generating, distributing, and trusting a dynamic local certificate across mobile OS is complex and fragile for a developer tool.
- **iOS:** The `app.json` Expo config sets `ios.infoPlist.NSAppTransportSecurity` with `NSAllowsLocalNetworking: true` to exempt local-network HTTP from ATS.
- **Android:** The `app.json` Expo config sets `android.usesCleartextTraffic: true`.
- **Security model:** The QR code contains a short-lived **bearer token** (randomly generated UUID) that must accompany every Connect-RPC request in the `Authorization` header. This prevents other devices on the same Wi-Fi from intercepting or replaying requests. Token validity is scoped to a single IDE session.
- **Future / Option 2:** The cloud relay (Option 2) uses TLS termination at the relay server—end-to-end encryption is provided by the HTTPS tunnel, not by the local sidecar.

### 4.7. Sidecar Lifecycle Management

- **Launch:** The IDE plugin spawns the Go sidecar as a child process on extension activation. The sidecar writes its allocated port to `stdout` (first line), which the plugin reads to configure the Connect-RPC client.
- **Port Allocation:** The Go sidecar attempts ports starting at `8765`, incrementing until it finds a free one. The resolved port is printed immediately to stdout so the IDE plugin can connect.
- **Single-instance lock:** To prevent multiple IDE windows from spawning conflicting sidecars, the Go process writes a **lockfile** at `{tmp}/code-compa-{workspaceHash}.lock` containing its PID and port. On startup, it checks for an existing lock; if the locked PID is still alive, it exits and the IDE plugin reuses that port instead.
- **Crash Recovery:** The IDE plugin monitors the child process. If it exits unexpectedly (non-zero exit code), the plugin waits 1 second and attempts a single automatic restart. If the restart also fails, the plugin surfaces a user-visible error notification with a "Restart Bridge" action button.
- **Graceful Shutdown:** On IDE deactivation (window close / extension deactivation hook), the plugin sends `SIGTERM` to the child process. The Go sidecar handles `SIGTERM` to close open streams, release the lockfile, and exit cleanly within 3 seconds.
- **Zombie prevention:** If the IDE is killed forcefully (SIGKILL), the lockfile PID check on next startup detects the stale lock (PID no longer alive) and replaces it.

### 4.8. Option 2 — Cloud Authentication (Deferred)

- The authentication and authorization protocol for the Secure Cloud Remote connection (Option 2) is **intentionally deferred** to the private backend repository that manages the cloud relay infrastructure.
- **Principle:** The Go sidecar and mobile app will consume an auth token (format TBD by the private repo team). This repo only needs to know how to pass the token in Connect-RPC metadata headers — the token issuance, refresh, and revocation flows live in the private backend.
- **Placeholder:** A dedicated spec (`specs/spec-XX-cloud-auth/`) will be created once the private backend API is stabilized, formally documenting the handshake contract between the public sidecar and the private relay.

### 4.9. Internationalization (i18n)

- **Mobile App:** To ensure the mobile application supports multiple languages (defaulting to English with easy expandability), we use `i18next` along with `react-i18next` for React Native bindings. Device language detection is managed via `expo-localization`. Translation resource files (JSON) are bundled locally in the application bundle.
- **VS Code Extension:** To localize the VS Code extension, we use the official `@vscode/l10n` library. Strings are wrapped in `vscode.l10n.t(...)` calls. The target translations are stored in `.l10n.json` resource bundles located in the extension's package directory.
- **Unified Standard:** No user-facing text should be hardcoded in any UI screen or extension command/notification. All strings must pass through their respective translation wrapper, pointing to a key in the translation bundle.

---

## 5. Spec-driven Development (SDD) Workflow

In **Code Compa**, we follow a strict **Spec-driven Development (SDD)** workflow. This means that all technical decisions, features, and implementation requirements are treated as specifications (specs) and must be formally documented inside the `specs/` directory _before_ any implementation begins.

Specs represent the source of truth for the project's features and technical requirements. Examples of specs include:

- **Core Executable Spec:** Detailing the Go-based background binary sidecar, its lifecycle, and how it starts the local server.
- **UI & Configuration Spec:** Describing the design and behavior of specific user interfaces, such as the toggle settings for switching between Local Wi-Fi and Secure Cloud Remote connection modes.
- **Message Contracts:** Defining Protocol Buffer schemas (`.proto`) for Connect-RPC services covering IPC (IDE ↔ Go Bridge) and LAN (Go Bridge ↔ Mobile App) communication.

### SDD Process:

1. **Spec Proposal & Documentation:** Write a clear specification document (Markdown, JSON Schema, etc.) under the `specs/` directory outlining the feature, design, constraints, and success criteria. Specifications must follow a strict folder naming convention with a two-digit numerical prefix and a short descriptive name (e.g. `specs/spec-01-go-bridge/`, `specs/spec-02-ui-toggle/`).
2. **Review & Freeze:** The specification is reviewed and approved as the official requirement.
3. **Implementation:** Developers and agents implement code, tests, and mock stubs directly conforming to the approved spec.
4. **Validation:** Continuous integration and tests verify that the software meets the exact requirements defined in the specs.

---

## 6. Standard Service Protocol (Connect-RPC & Protobuf Spec)

All communication between the IDE, Go Bridge, and mobile application is defined via Protocol Buffers. 

### Protobuf Definition: `proto/codecompa/v1/companion.proto`

```protobuf
syntax = "proto3";

package codecompa.v1;

option go_package = "github.com/jalbarran/code-compa/packages/bridge-go/pkg/api/v1;apiv1";

service CompanionService {
  // The mobile app calls this stream to receive real-time events from the AI agent
  rpc StreamAgentEvents(StreamAgentEventsRequest) returns (stream AgentEvent);
  
  // The mobile app responds to a pending human intervention request
  rpc RespondToIntervention(RespondToInterventionRequest) returns (RespondToInterventionResponse);
}

message StreamAgentEventsRequest {}

message AgentEvent {
  string event_id = 1;
  string type = 2; // e.g. "COMMAND_EXECUTION_REQUEST"
  AgentMetadata metadata = 3;
  AgentPayload payload = 4;
}

message AgentMetadata {
  string ide = 1;         // e.g. "Antigravity_2.0"
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
```

### Event Lifecycle:

1. **Agent Requests Approval:** The AI agent running inside the IDE triggers a command or action requiring verification. The IDE plugin alerts the Go bridge, which queues the request.
2. **Server Streaming:** The mobile app, having called `StreamAgentEvents` at startup, receives an `AgentEvent` pushed down the active HTTP stream.
3. **User Action:** The mobile UI renders the command details and decision options. The developer chooses an action and (optionally) provides text input.
4. **Resolution:** The mobile app calls `RespondToIntervention`. Upon receiving the response, the Go Bridge signals the IDE plugin, unblocking the agent.

---

## 7. Execution Strategy and Roadmap

To mitigate risks, the project will be built incrementally, focusing first on protocol validation on a single environment.

### 📋 Phase 1: Bridge Validation (VS Code + Go)

- [ ] Set up the monorepo with the initial structure.
- [ ] Write the first spec (`specs/spec-01-go-bridge/`) covering the sidecar lifecycle, port allocation, and IPC contract.
- [ ] Develop a basic VS Code extension in TypeScript that runs the Go background process safely.
- [ ] Write Go code to detect the local Wi-Fi IP and start the Connect-RPC HTTP server.
- [ ] Implement the logic to inject `chmod +x` permissions from Node.js on Mac/Linux.
- [ ] Define `.proto` files under `proto/codecompa/v1/` and generate Go + TypeScript stubs with `make proto`.

### 📱 Phase 2: Mobile Companion (Expo)

- [ ] Write the spec (`specs/spec-02-mobile-companion/`) covering QR handshake, streaming connection, and HITL UI flow.
- [ ] Initialize the mobile app using Expo Router.
- [ ] Integrate `expo-camera` to read the QR code generated by the IDE.
- [ ] Validate real-time Server-Streaming Connect-RPC connection (PC ↔ Phone).
- [ ] Build type-safe Connect-RPC client from generated TypeScript stubs.

### 🚀 Phase 3: Ecosystem and Integration

- [ ] Connect real event hooks from the IDE agents to the Go server.
- [ ] Design mobile UI screens tailored for summarizing code diffs and prompts.
- [ ] **Phase 4 (Future):** Replicate the thin plugin layer in the JetBrains ecosystem using Kotlin, connecting to the same Go bridge.

---

## 8. Directory Structure

```text
code-compa/
├── .gitignore
├── Makefile                    <-- `make proto` runs buf generate
├── buf.yaml                    <-- buf workspace & lint config
├── buf.gen.yaml                <-- buf code-generation plugins config
├── README.md
├── ARCHITECTURE.md             <-- System architecture & SDD guidelines
│
├── specs/                      <-- Specifications docs only (no source code)
│   ├── spec-01-go-bridge/      <-- Spec: sidecar lifecycle & IPC contract
│   │   └── README.md           <-- Design doc, behavior, success criteria
│   └── spec-02-mobile-companion/ <-- Spec: QR handshake & HITL UI flow
│       └── README.md
│
├── proto/                      <-- Protocol Buffer source files
│   └── codecompa/
│       └── v1/
│           └── companion.proto <-- Canonical Connect-RPC service definition
│
├── apps/                       <-- User-facing applications
│   └── mobile-expo/            <-- Expo Project (React Native)
│       ├── app/                <-- Screen directory (Expo Router)
│       ├── components/         <-- Shared mobile UI components
│       ├── package.json
│       └── app.json            <-- Expo config (cleartext HTTP exceptions)
│
├── packages/                   <-- Shared modules, libraries, and backend
│   ├── bridge-go/              <-- Universal Go core (Sidecar)
│   │   ├── cmd/
│   │   │   └── bridge/         <-- Binary entry point (`main.go`)
│   │   ├── internal/           <-- Private server code (Connect-RPC, LAN)
│   │   │   ├── server/         <-- Connect-RPC HTTP server logic
│   │   │   └── discovery/      <-- PC local IP discovery logic
│   │   ├── pkg/api/v1/         <-- Generated Go stubs (committed)
│   │   ├── go.mod
│   │   └── go.sum
│   │
│   └── proto-ts/               <-- Generated TypeScript stubs (committed)
│       ├── package.json
│       └── src/                <-- Output of protoc-gen-es + connect-es
│
└── plugins/                    <-- IDE extensions
    ├── vscode-extension/       <-- Extension for VS Code / Cursor
    │   ├── src/
    │   │   └── extension.ts    <-- Extension entry point (TypeScript)
    │   ├── bin/                <-- Folder containing compiled Go binaries
    │   │   ├── .gitkeep
    │   │   ├── bridge-darwin-arm64
    │   │   └── bridge-windows-amd64.exe
    │   ├── package.json        <-- VS Code extension manifest
    │   └── tsconfig.json
    │
    └── jetbrains-plugin/       <-- Reserved for future JetBrains plugin (Kotlin)
        └── .gitkeep
```
