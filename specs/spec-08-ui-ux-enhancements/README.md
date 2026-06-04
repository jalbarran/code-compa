# Spec 08: UI/UX Enhancements

This specification defines the requirements and technical design for several UI/UX enhancements inside the **Code Compa** mobile application and extension ecosystem, focusing on session history details, dynamic localization and theme overrides, audio alert notifications, and a comprehensive localization quality audit.

---

## 1. Overview & Goal

The goal of this specification is to transition Code Compa from a basic functional app to a polished, premium utility with advanced accessibility settings and detailed execution introspection.

### Key Features:
- **Session History Inspector:** Interactive modal sheet to view rich details of previously resolved actions.
- **Dynamic Localization Toggle:** Dynamic runtime locale shifting (English / Spanish) in Settings.
- **Theme Mode Override:** Settings view toggles to enforce Dark mode, Light mode, or follow the Device system theme.
- **Audible Alerts:** Toggled sound effect playing upon receipt of blocking intervention requests.
- **i18n Audit & Standards:** Guidelines to guarantee zero hardcoded strings.

---

## 2. Session History Inspector

When developers tap on a card inside the "Session History" list on `dashboard.tsx`, the application must display a full detail view of the resolved event.

### 2.1. UI Design (Tamagui Sheet)
- Use the Tamagui `Sheet` primitive to slides up from the bottom of the screen.
- **Metadata Header:** Shows IDE target, agent name, resolved status, and a full timestamp.
- **Details Section:**
  - Shows original request Title and Description.
  - Renders the execution Command inside a code block.
  - Renders the workspace Directory path.
  - Displays the Code Diff with colored line highlighting if applicable.
  - Displays the Prompt instructions if applicable.
- **Auditing/Response Card:**
  - Highlights what decision option the user selected (e.g. "APPROVED" or "REJECTED").
  - Renders any custom feedback text entered by the user.

---

## 3. Settings View (Language & Theme)

Create a dedicated tab or toggle menu (`apps/mobile-expo/src/app/settings.tsx`) to manage app preferences.

### 3.1. Language Selection (i18n Runtime Shift)
- **Controls:** Segmented control or dropdown menu offering **English (EN)** and **Spanish (ES)**.
- **Implementation:**
  - Modify language state in the Zustand store.
  - Dynamically swap localization bundles using:
    ```typescript
    import i18next from 'i18next';
    i18next.changeLanguage(selectedLocale);
    ```

### 3.2. Theme Selection (Tamagui Theme Override)
- **Controls:** Segmented selector offering **System (Default)**, **Light Mode**, and **Dark Mode**.
- **Implementation:**
  - Save theme choice to Zustand state.
  - Override the value passed to the root Tamagui `<ThemeProvider>` layout wrapper (`apps/mobile-expo/src/app/_layout.tsx`):
    ```typescript
    const currentTheme = userPreferredTheme === 'system' ? systemScheme : userPreferredTheme;
    return <Theme name={currentTheme}>...</Theme>;
    ```

---

## 4. Audio Notification Alerts

To grab the user's attention when they are away from their desk, the app will emit an audible notification when a blocking event requires intervention.

### 4.1. Alerts Implementation
- **Library:** Use the standard Expo audio API: `expo-av`.
- **Sound Asset:** Bundled lightweight, pleasant notification chime (e.g. `assets/sounds/notification.mp3`).
- **Trigger:** Played programmatically inside the connection store `StreamAgentEvents` processing block upon receiving a new non-telemetry event:
  ```typescript
  import { Audio } from 'expo-av';

  async function playAlertSound() {
    const { sound } = await Audio.Sound.createAsync(
      require('../../assets/sounds/notification.mp3')
    );
    await sound.playAsync();
  }
  ```

### 4.2. Configuration Guard
- Settings View contributes an **"Enable Sound Alerts"** toggle switch.
- Only trigger `playAlertSound()` if `soundAlertsEnabled` is `true` in settings.

---

## 5. i18n & l10n Review Audit Checklist

To guarantee absolute localization compliance:

### 5.1. VS Code Extension Audit
- Verify that every notification, button prompt, error report, lockfile dialog, and sidebar loading string is wrapped in `vscode.l10n.t(...)`.
- Verify translations exist in `plugins/vscode-extension/l10n/bundle.l10n.es.json`.

### 5.2. Mobile Companion App Audit
- Verify all headers, labels, form placeholding strings, and error messages use the `useTranslation().t()` hook.
- Audit JSON files in `apps/mobile-expo/src/i18n/locales/en.json` and `es.json` to make sure keys match and translations are complete.
