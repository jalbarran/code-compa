# Spec-03: Internationalization (i18n)

This specification defines how internationalization (i18n) is applied across the **Code Compa** codebase, specifically within the IDE plugin (VS Code) and the mobile companion app (Expo/React Native).

---

## 1. Goal & Requirements

- Support multiple languages, initially focusing on English (`en`) and Spanish (`es`).
- Ensure no user-facing strings are hardcoded in typescript/TSX components or functions.
- The default language for all components must be English (`en`).
- Detect the user's system locale automatically on mobile.
- Use native/recommended framework solutions to avoid custom translation logic.

---

## 2. VS Code Extension i18n (`plugins/vscode-extension`)

### Tech Stack
- **API:** Native `vscode.l10n` API (available since VS Code 1.73).
- **Bundles:** `.l10n.json` files stored under the `l10n` directory.

### Configuration
1. Register the `l10n` directory in `package.json`:
   ```json
   "l10n": "./l10n"
   ```
2. Create standard translation files:
   - `l10n/bundle.l10n.es.json` for Spanish translations.

### Usage in Code
Strings must be wrapped using `vscode.l10n.t()`:
```typescript
import * as vscode from 'vscode';

// Unary message
vscode.window.showInformationMessage(vscode.l10n.t("Restart Bridge"));

// Interpolated message
vscode.window.showInformationMessage(
  vscode.l10n.t("Code Compa Bridge started successfully on port {0}", port)
);
```

---

## 3. Mobile Companion App i18n (`apps/mobile-expo`)

### Tech Stack
- **Framework:** `i18next` & `react-i18next`
- **Detection:** `expo-localization`

### Configuration
1. Install dependencies:
   - `i18next`
   - `react-i18next`
   - `expo-localization`
2. Create an initialization script at `apps/mobile-expo/src/i18n/index.ts` that:
   - Queries `expo-localization` to get the system language.
   - Initialises `i18next` with local translation resources (`en` and `es` JSON files).
   - Configures fallback to `en`.

### Usage in Code
Use the `useTranslation` hook from `react-i18next` inside UI components:
```tsx
import { useTranslation } from 'react-i18next';

export default function MyComponent() {
  const { t } = useTranslation();
  return <Text>{t('dashboard.disconnect')}</Text>;
}
```

---

## 4. Verification & Testing

### VS Code Extension
- Run VS Code with different locales (e.g., `--locale=es`) and verify that info/error messages and options are displayed in the corresponding language.

### Mobile App
- Change device system language settings in the emulator/device.
- Verify that headers, titles, risk levels, and status indicators adapt to the active locale.
