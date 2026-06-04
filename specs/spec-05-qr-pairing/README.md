# Spec 05: Automated QR Code Pairing

This specification defines the requirements and behavior for generating a connection QR code within the IDE and scanning it with the mobile companion app to automate the local pairing process.

---

## 1. Overview & Goal

To eliminate the friction of typing IP addresses, ports, and tokens, **Code Compa** supports automated pairing. The IDE plugin generates a QR code containing connection metadata, and the mobile companion uses the camera to scan and pair instantly.

### Key Objectives:
- Implement a VS Code Webview (e.g. in a sidebar or editor tab) to display pairing details and a generated QR code.
- Implement QR code generation in TypeScript using a standard browser-compatible library (e.g. `qrcode`).
- Configure the Expo mobile app's barcode scanner (`expo-camera`) to capture, validate, and parse the QR code payload.
- Establish the connection immediately upon scanning.

---

## 2. QR Code Payload & Generation

### 2.1. Payload Format
The QR code encodes a single JSON object containing connection parameters:
```json
{
  "ip": "192.168.1.15",
  "port": 8765,
  "token": "a1b2c3d4-e5f6-7a8b-9c0d-ef1234567890"
}
```

### 2.2. IDE Side Rendering (VS Code)
1. **Trigger:** Once the Go Bridge starts and reports status `READY` (or the VS Code extension reads the lockfile and retrieves the port and token), the Webview is shown/updated.
2. **Webview Provider:** A VS Code sidebar panel (using a `WebviewViewProvider` contributing to a `code-compa-sidebar` view) renders the QR code.
3. **Libraries:** Use the `qrcode` package to generate the QR data URL or render it directly to a `<canvas>` element inside the Webview.
4. **UX:** The Webview displays:
   - The QR code.
   - The connection parameters in plain text (IP, Port, and a masked Token) for troubleshooting or manual entry.
   - An indicator of the connection status (e.g. "Waiting for mobile connection...").

---

## 3. Mobile Scan Integration

### 3.1. Camera View Scan
- Under `apps/mobile-expo/src/app/scan.tsx`, when in scanning mode, render the `CameraView` from `expo-camera`.
- Ensure standard barcode scanner settings are configured to search only for QR codes:
  ```tsx
  barcodeScannerSettings={{
    barcodeTypes: ['qr'],
  }}
  ```

### 3.2. Scanning and Handshake Steps
1. The user aligns the mobile camera with the QR code on the monitor.
2. When scanned, `onBarcodeScanned` fires.
3. The JSON payload is parsed.
4. **Validation:** If the fields `ip`, `port`, and `token` are not present, trigger `t('scan.invalidQr')` error and resume scanning.
5. If valid, trigger the store's `connect` function, transition to the Dashboard, and stop scanning.

---

## 4. Verification & Success Criteria

### 4.1. IDE Visual Check
- Start the VS Code extension. Open the Code Compa view container.
- Verify that a valid QR code is rendered and changes when the bridge token/port changes.

### 4.2. End-to-End Pairing Check
- Open the mobile companion app in scanning mode.
- Scan the generated QR code from the screen.
- Verify that the app transitions to `CONNECTED` status automatically and displays the dashboard with no manual text entry required.
