# Contributing to Code Compa 🚀

Thank you for contributing to Code Compa! Follow these steps to set up your local development environment and run tests.

---

## 🛠️ Dev Environment Setup

1. **Install Prerequisites**:
   - **Node.js** (v18 or superior)
   - **Go** (v1.20 or superior)
   - **buf** CLI (for protobuf generation)

2. **Install Workspace Dependencies**:
   From the repository root, install dependencies for the VS Code extension and compile:
   ```bash
   make install-extension
   make build-extension
   ```

3. **Generate Protocols**:
   If you change any `.proto` service definition, regenerate the client/server files from the root:
   ```bash
   make proto
   ```

4. **Build the Go sidecar (bridge)**:
   ```bash
   make build-bridge
   ```

5. **Start Mobile Companion (Expo)**:
   ```bash
   cd apps/mobile-expo
   npm install
   npm run start-clear
   ```

---

## 🧪 Testing Guidelines

Verify your modifications by running all tests before submitting:

### Go Tests
Run the Go unit tests:
```bash
make test-go
```

### I18n Integrity
Verify that translations match and are valid:
```bash
make test-i18n
```

### Build & Lint
Compile the whole project:
```bash
make all
```
Ensure all files compile without syntax or compiler errors.
