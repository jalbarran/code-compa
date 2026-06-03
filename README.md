# Code Compa 🚀

**Code Compa** is a decentralized, local-first ecosystem designed to act as the remote control and telemetry dashboard for your AI agents while they run in your IDE.

This project does not replace or duplicate the logic of AI agents (such as Gemini or Claude) integrated into **Antigravity IDE** or **VS Code**. Its exclusive purpose is to serve as a bridge so you can step away from your desk, monitor coding progress from your phone, and respond to critical context requests (**Human-in-the-loop**) without disrupting the AI's autonomous workflow.

The companion mobile app and IDE plugin support two communication modes:

- **Option 1: Direct Local Wi-Fi Connection (Default - Free/Offline):** A local peer-to-peer connection over Wi-Fi requiring zero internet connection.
- **Option 2: Secure Cloud Remote Connection (Premium/Paid):** A secure internet connection via a cloud relay service for when you are away from the local network. The cloud infrastructure is powered by a separate, proprietary backend repository.

---

## 🛠️ Tech Stack

The project is structured as a monorepo that combines high-performance networking with a fast, modern mobile development experience:

- **Mobile App:** [Expo (React Native)](https://expo.dev/) with **Expo Router** for native file-based routing. Supports both connection modes.
- **Universal Bridge (Sidecar):** [Go (Golang)](https://go.dev/) to manage concurrency, lightweight network sockets, and the local server lifecycle.
- **IDE Plugin:** TypeScript using the **VS Code API** (natively compatible with Antigravity IDE, VS Code, and Cursor). Contains settings toggles to switch connection modes.
- **Communication:** **Connect-RPC** (via unary and Server-Streaming HTTP) over the Local Area Network (LAN) for local mode, and cloud connections for remote mode.

---

## 🏗️ System Architecture

To avoid duplicating network code and keep IDE plugins as lightweight as possible, we implement a **Shared Core Strategy** using a Go binary that acts as a sidecar process.

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
│ Antigravity IDE  │ │  VS Code Plugin  │ │  Cursor Plugin   │
│   (TypeScript)   │ │   (TypeScript)   │ │   (TypeScript)   │
└──────────────────┘ └──────────────────┘ └──────────────────┘
```

### Key Engineering Features:

1. **Flexible Connectivity Modes:** The plugin lets you toggle between Local Wi-Fi (default, offline-friendly) and Secure Cloud (paid, internet-required) connections.
2. **Local-First & Privacy (by Default):** With local mode, communication is strictly local Peer-to-Peer over your Wi-Fi network. No source code or prompts ever travel to central third-party servers.
3. **Zero-Configuration (QR Handshake):** Upon launching the IDE in local mode, the Go process starts a secure Connect-RPC HTTP server and displays a QR code containing connection credentials (IP + Port + Token) for instant pairing.
4. **Automated Native Permissions:** The TypeScript extension automatically ensures correct execution permissions for the Go sidecar binary (`chmod +x` on Unix systems) during activation.
5. **Spec-driven Development (SDD):** All technical decisions, features, and implementation tasks (e.g., sidecar server implementation, settings toggle UI) must be fully specified and documented in the `specs/` directory before coding. These specs act as the target that the implementation must satisfy.

---

## 📂 Monorepo Structure

```text
code-compa/
├── specs/                      # Specifications folder (e.g. spec-01-go-bridge, spec-02-ui-toggle)
├── apps/
│   └── mobile-expo/            # Mobile application using Expo (React Native)
├── packages/
│   └── bridge-go/              # Go-based WebSocket server and network orchestrator
└── plugins/
    └── vscode-extension/       # Unified extension for Antigravity / VS Code
        └── bin/                # Compiled Go binaries per architecture
```

For more architectural details, refer to [ARCHITECTURE.md](ARCHITECTURE.md).

---

## 🚀 Development Environment

### Prerequisites

- [Go](https://go.dev/doc/install) (v1.20 or superior)
- [Node.js](https://nodejs.org/) (v18 or superior) and npm/yarn
- [Expo CLI](https://docs.expo.dev/)

### 1. Initialize the Go Backend

```bash
cd packages/bridge-go
go mod download
# To run the local test server:
go run cmd/bridge/main.go
```

### 2. Launch the Mobile App (Expo)

```bash
cd apps/mobile-expo
npm install
npx expo start
```

_Press `a` to open the Android emulator, `i` for iOS, or scan the QR code using the Expo Go app on your physical phone._

### 3. Run the IDE Extension

1. Open the `plugins/vscode-extension` folder in a new window of VS Code / Antigravity IDE.
2. Run `npm install`.
3. Press `F5` to open a new IDE window with the extension running in development mode (_Extension Development Host_).

---

## 🗺️ Execution Roadmap

- [ ] **Phase 1: Spec & Sidecar Lifecycle:** Define core payload JSON Schemas under `specs/` and establish the Sidecar lifecycle (IDE extension running the background Go binary).
- [ ] **Phase 2: Network Handshake:** WebSocket server in Go with auto local-IP detection and QR code handshake.
- [ ] **Phase 3: Mobile Companion:** Basic UI built with Expo Router displaying connection status and responding to control tasks.
- [ ] **Phase 4: Agent Integration:** Connecting real event hooks from Antigravity IDE to the Go backend.

---

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for details.
