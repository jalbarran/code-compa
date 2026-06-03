const fs = require('fs');
const path = require('path');

let hasErrors = false;

// Helpers to colorize logs
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;

function checkMobileFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // 1. Check for raw JSX text: e.g. <Text>Hello</Text> or <Button>Connect</Button>
    // This looks for content between > and < that contains letters/numbers and isn't a JSX expression {...}
    const jsxTextRegex = />([^<{}]+)</g;
    let match;
    while ((match = jsxTextRegex.exec(line)) !== null) {
      const text = match[1].trim();
      // Skip empty or purely symbol/whitespace strings
      if (/[a-zA-Z]/.test(text)) {
        console.error(red(`[Error] Mobile Raw Text: "${text}" at ${filePath}:${index + 1}`));
        hasErrors = true;
      }
    }

    // 2. Check for hardcoded string attributes (placeholder, label, title, text)
    // e.g. placeholder="Enter details" vs placeholder={t("...")}
    const attrRegex = /\b(placeholder|label|title|text)="([^"]*[a-zA-Z][^"]*)"/g;
    while ((match = attrRegex.exec(line)) !== null) {
      const attr = match[1];
      const val = match[2];
      // Skip if it's a known non-localized constant or configuration key
      if (val.startsWith('$') || val.includes('/') || val.includes('.') || val === 'active' || val === 'dark' || val === 'outlined' || val === 'numeric') {
        continue;
      }
      console.error(red(`[Error] Mobile Hardcoded Attribute [${attr}="${val}"]: at ${filePath}:${index + 1}`));
      hasErrors = true;
    }
  });
}

function checkVSCodeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    // Check for vscode message calls passing literal strings instead of vscode.l10n.t
    // e.g., showErrorMessage('error message') or showInformationMessage("started")
    // Match showErrorMessage, showInformationMessage, showWarningMessage followed by raw string quotes
    const rawMessageRegex = /show(ErrorMessage|InformationMessage|WarningMessage)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = rawMessageRegex.exec(line)) !== null) {
      const msg = match[2];
      console.error(red(`[Error] VS Code Hardcoded Notification: "${msg}" at ${filePath}:${index + 1}`));
      hasErrors = true;
    }
  });
}

function walkDir(dir, filter, callback) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.expo' && file !== 'out' && file !== 'bin') {
        walkDir(filePath, filter, callback);
      }
    } else if (filter(filePath)) {
      callback(filePath);
    }
  });
}

console.log(yellow('=== Starting i18n Hardcoded Text Audit ==='));

// Check mobile app files
walkDir(
  path.join(__dirname, '../apps/mobile-expo/src'),
  (file) => file.endsWith('.tsx'),
  checkMobileFile
);

// Check VS Code extension files
walkDir(
  path.join(__dirname, '../plugins/vscode-extension/src'),
  (file) => file.endsWith('.ts'),
  checkVSCodeFile
);

if (hasErrors) {
  console.log(red('\n=== Audit Failed: Hardcoded text found in UI display ==='));
  process.exit(1);
} else {
  console.log(green('\n=== Audit Passed: All UI strings are properly i18n\'ed ==='));
  process.exit(0);
}
