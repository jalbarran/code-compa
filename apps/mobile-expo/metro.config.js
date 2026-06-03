const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages from
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force Metro to resolve key packages locally to prevent double loading
config.resolver.extraNodeModules = {
  '@bufbuild/protobuf': path.resolve(projectRoot, 'node_modules/@bufbuild/protobuf'),
  '@connectrpc/connect': path.resolve(projectRoot, 'node_modules/@connectrpc/connect'),
};

// 4. Resolve .js imports inside ts files back to their .ts/.tsx sources (for ESM compat)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith('.js')) {
    const withoutExtension = moduleName.slice(0, -3);
    try {
      return context.resolveRequest(context, withoutExtension, platform);
    } catch (err) {
      // Fall back to original moduleName if it cannot be resolved without extension
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
