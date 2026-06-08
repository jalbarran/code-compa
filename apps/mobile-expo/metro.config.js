const { getDefaultConfig } = require('expo/metro-config');
const { withTamagui } = require('@tamagui/metro-plugin');
const path = require('path');
const fs = require('fs');

// Find the project and workspace directories using realpath to resolve any symlinks
const projectRoot = fs.realpathSync(__dirname);
const workspaceRoot = fs.realpathSync(path.resolve(projectRoot, '../..'));

let config = getDefaultConfig(projectRoot);

const defaultResolveRequest = config.resolver.resolveRequest;

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

config.resolver.platforms = ['ios', 'android', 'web', 'node', 'server'];

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
  let targetModuleName = moduleName;
  if (moduleName.endsWith('.js')) {
    targetModuleName = moduleName.slice(0, -3);
  }

  if (defaultResolveRequest) {
    try {
      return defaultResolveRequest(context, targetModuleName, platform);
    } catch (err) {
      if (targetModuleName !== moduleName) {
        try {
          return defaultResolveRequest(context, moduleName, platform);
        } catch (fallbackErr) {}
      }
    }
  }

  try {
    return context.resolveRequest(context, targetModuleName, platform);
  } catch (err) {
    if (targetModuleName !== moduleName) {
      return context.resolveRequest(context, moduleName, platform);
    }
    throw err;
  }
};

module.exports = withTamagui(config, {
  components: ['tamagui'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui.css',
  isCSSEnabled: true,
});
