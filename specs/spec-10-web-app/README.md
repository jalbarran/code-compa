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

- The static web assets are pre-built (offline) and packaged inside the `.vsix` under `bin/web/`.
- The Go Sidecar accepts a `-web-dir` CLI parameter with the absolute path to this folder.
- If `-web-dir` is non-empty and the directory exists, the sidecar initializes an `http.FileServer`:
  ```go
  // Example Go routing
  mux := http.NewServeMux()
  // Mount Connect-RPC Handlers
  mux.Handle(companionv1connect.NewCompanionServiceHandler(server))
  // Serve web app static files (only if -web-dir is provided)
  if webDir != "" {
      fs := http.FileServer(http.Dir(webDir))
      mux.Handle("/web/", http.StripPrefix("/web/", fs))
  }
  ```
- The sidecar's startup JSON output (written to `stdout`) includes a `webEnabled` field:
  ```json
  { "port": 8765, "token": "...", "status": "READY", "webEnabled": true }
  ```
  If `-web-dir` was not provided or the path does not exist, `webEnabled` is `false`.

### 2.2. Dual QR Modes in VS Code Sidebar

The sidebar panel provides **two horizontal tabs**: **"Native App"** (default) and **"Web App"**.

- The **"Web App"** tab is **hidden** when the sidecar reports `webEnabled: false` in its stdout JSON. This is the default behavior in local development without a pre-built `bin/web/` directory.

#### Tab A: Native App (Android/iOS) — Default
- **QR Code Content:** JSON format (as defined in Spec 05):
  ```json
  {
    "ip": "<LAN-IP>",
    "port": <PORT>,
    "token": "<UUID>"
  }
  ```
- **UX:** When scanned from inside the Code Compa Native Android/iOS App, it is parsed and processed internally.

#### Tab B: Web App (Browser)
- **Target URL:** `http://<LAN-IP>:<PORT>/web/?token=<UUID>`
- **QR Code Content:** The plaintext URL string.
- **UX:** When scanned with a standard mobile camera, the device prompts to open the URL in Chrome, Safari, or the system browser.

### 2.3. Prerequisitos de Build Web (Tamagui + Metro)

Before running `npx expo export --platform web`, the Expo project requires Tamagui-specific configuration to correctly extract CSS and styles for the web target.

#### 2.3.1. Package Installation

```bash
# Run from apps/mobile-expo
npm install @tamagui/metro-plugin
```

#### 2.3.2. `metro.config.js` Changes

`metro.config.js` must be updated to enable CSS support and wrap the config with `withTamagui`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// isCSSEnabled is required for Tamagui CSS extraction on web builds
const config = getDefaultConfig(projectRoot, { isCSSEnabled: true });

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.extraNodeModules = {
  '@bufbuild/protobuf': path.resolve(projectRoot, 'node_modules/@bufbuild/protobuf'),
  '@connectrpc/connect': path.resolve(projectRoot, 'node_modules/@connectrpc/connect'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const withoutExtension = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, withoutExtension, platform);
    } catch (err) {}
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withTamagui(config, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
});
```

### 2.4. Build Pipeline

A `make build:web` target in the root `Makefile` orchestrates the full web build:

```makefile
build:web:
    cd apps/mobile-expo && npx expo export --platform web
    rm -rf plugins/vscode-extension/bin/web
    cp -r apps/mobile-expo/dist plugins/vscode-extension/bin/web
```

This target must be run before packaging the `.vsix` extension. The resulting `bin/web/` directory is **committed to `.gitignore`** and treated as a build artifact.

---

## 3. Web App Handshake & Session Management

### 3.1. Token Extraction on Load

On load, the web app checks URL query parameters to auto-connect:

```typescript
// In the root layout or index screen (web-only path)
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  if (token) {
    const { hostname, port } = window.location;
    connect(hostname, Number(port) || 80, token);
  }
}
```

- If a token is present in the URL, the app connects immediately and navigates to the dashboard — skipping the scan/pair screen entirely.
- The token is managed by the Zustand store (`useConnectionStore`).
- The `connect()` call uses `window.location.origin` as the base URL for the Connect-RPC transport (the Go sidecar serves both static files and API from the same port).

### 3.2. Connect-RPC Headers

All subsequent requests include the token in the `Authorization` header: `Bearer <token>`.

### 3.3. Scan Screen on Web (No Token)

If the user navigates to `/web/` without a `?token=` parameter (e.g., typed URL manually), the scan screen **must not render the `CameraView`** component. Instead, it shows **only the manual entry form** (IP, Port, Token fields) since scanning a QR from the same device has no UX value in a browser context.

Implementation: use a platform/environment check before rendering `CameraView`:

```typescript
import { Platform } from 'react-native';

// In scan.tsx — skip camera entirely on web
const isWeb = Platform.OS === 'web';
```

When `isWeb === true`, the scanner section is hidden and the manual form is shown directly (no toggle needed).

### 3.4. Haptics on Web

`expo-haptics` is a native-only API. Calls to `Haptics.notificationAsync()` are already wrapped in a `try/catch` that silently ignores errors. This is sufficient — haptics are a progressive enhancement and must not break the web experience.

---

## 4. Verification & Success Criteria

### 4.1. Metro & Tamagui Web Build

- Install `@tamagui/metro-plugin` in `apps/mobile-expo`.
- Update `metro.config.js` with `isCSSEnabled: true` and `withTamagui(...)`.
- Run `make build:web` from repo root.
- Verify `plugins/vscode-extension/bin/web/index.html` exists and assets are present.

### 4.2. Go Sidecar Web Serving

- Build the Go sidecar.
- Start the sidecar with `-web-dir <absolute-path-to-bin/web>`.
- Verify stdout JSON includes `"webEnabled": true`.
- Access `http://localhost:<PORT>/web/?token=XXX` in a desktop browser.
- Verify the companion dashboard UI renders with Tamagui styles applied.

### 4.3. Auto-Connect via URL Token

- Open `http://localhost:<PORT>/web/?token=XXX` in a browser.
- Verify the app skips the scan screen and goes directly to the dashboard.
- Verify the Connect-RPC stream connects and telemetry/intervention events are received.

### 4.4. Web Scan Screen Fallback

- Open `http://localhost:<PORT>/web/` (no `?token=`).
- Verify only the manual entry form is shown — no camera component renders.
- Enter credentials manually and verify connection succeeds.

### 4.5. Dual QR in VS Code Sidebar

- Launch the VS Code Extension with a build that includes `bin/web/`.
- Verify the sidebar shows two tabs: "Native App" (default) and "Web App".
- Verify the "Web App" tab QR encodes the plaintext URL with `?token=`.
- Verify the "Native App" tab QR encodes the JSON payload.
- Launch extension **without** `bin/web/` — verify only the "Native App" tab is shown.

### 4.6. Dual QR LAN Scan

- Scanning the Web App QR code on a mobile device on the same LAN successfully opens the app in the browser and connects to the development environment.
