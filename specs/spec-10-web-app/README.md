# Spec 10: Expo Web App Support & Dual QR Pairing

This specification defines the behavior, requirements, and design for building, packaging, serving, and accessing a web version of the Code Compa mobile app directly from the VS Code extension.

---

## 1. Overview & Goal

To reduce onboarding friction and allow immediate use without downloading an Android/iOS native package, the **Code Compa** companion app will also target the Web platform. The VS Code sidebar WebView will display two options for pairing:
1. **Web App Link (Browser):** Generates a QR code with a URL pointing to the local IP/port serving the static Web build, including a security token as a query parameter.
2. **Native App Link:** Generates a QR code with a JSON payload containing connection parameters (IP, Port, Token) to be parsed by the native Android/iOS app scanner.

The Go sidecar (Bridge) will serve the static web files in addition to handling Connect-RPC APIs.

---

## 2. Technical Architecture

```
                               ┌─────────────────────────────────┐
                               │ Mobile Browser (Safari/Chrome)  │
                               └────────────────▲────────────────┘
                                                │
                                    (HTTP Static Web Assets)
                                                │
┌────────────────────────┐     ┌────────────────┴────────────────┐
│   VS Code Extension    │◄────┤    Go Bridge (Static Server)    │
│  - Serves static dist  │     │  - Serves /web/ folder          │
│  - Generates Dual QRs  │     │  - Handles /codecompa.v1.* APIs │
└────────────────────────┘     └─────────────────────────────────┘
```

### 2.1. Go Sidecar Serving Web Assets
- The VS Code extension compiles/bundles the Expo web assets into a folder (e.g. `dist/`).
- The Go Sidecar, upon startup, accepts a `-web-dir` CLI parameter indicating the absolute path to this folder.
- The Go Sidecar initializes an `http.FileServer` bound to the `/web/` path prefix:
  ```go
  // Example Go routing
  mux := http.NewServeMux()
  // Mount Connect-RPC Handlers
  mux.Handle(companionv1connect.NewCompanionServiceHandler(server))
  // Serve web app static files
  fs := http.FileServer(http.Dir(webDir))
  mux.Handle("/web/", http.StripPrefix("/web/", fs))
  ```

### 2.2. Dual QR Modes in VS Code sidebar
The sidebar panel provides a toggle or selector (e.g., tabs or a dropdown) to choose the connection mode:

#### Mode A: Web Browser (No Installation)
- **Target URL:** `http://<LAN-IP>:<PORT>/web/?token=<UUID>`
- **QR Code Content:** The plaintext URL string.
- **UX:** When scanned with a standard mobile camera, the device prompts to open the URL in Chrome, Safari, or the system browser.

#### Mode B: Native App (Android/iOS)
- **QR Code Content:** JSON format (as defined in Spec 05):
  ```json
  {
    "ip": "<LAN-IP>",
    "port": <PORT>,
    "token": "<UUID>"
  }
  ```
- **UX:** When scanned from inside the Code Compa Native Android/iOS App, it is parsed and processed internally.

---

## 3. Web App Handshake & Session Management

1. **Token Extraction:**
   - On load, the web app checks URL query parameters:
     ```typescript
     const urlParams = new URLSearchParams(window.location.search);
     const token = urlParams.get('token');
     ```
   - If a token is present, it is saved to the store (`Zustand`) and persisted in `sessionStorage` or `localStorage`.
   - The app initiates connection to the API backend at `window.location.origin` (the same host/port serving the static page).

2. **Connect-RPC Headers:**
   - All subsequent requests include the token in the `Authorization` header: `Bearer <token>`.

---

## 4. Verification & Success Criteria

### 4.1. Web Assembly/Build Verification
- Run `npx expo export --platform web` in `apps/mobile-expo`.
- Verify the exported directory has a valid `index.html` and assets.

### 4.2. Local Serving Check
- Start the Go sidecar with the path to the exported web directory.
- Access `http://localhost:<PORT>/web/?token=test-token` via a browser.
- Verify the companion dashboard UI renders using Tamagui.

### 4.3. Dual QR Generation
- Launch the VS Code Extension.
- Verify that toggling between "Web App" and "Native App" updates the QR code content.
- Scanning the Web QR code on a mobile device on the same LAN successfully connects to the local development environment.
