// Metro config for this Expo app inside a pnpm monorepo.
//
// Two things are non-default and required here:
//
//  1. Workspace packages (`@aurora/*`) live in `../../packages/*` and are
//     symlinked into this app's `node_modules`. Metro must WATCH the workspace
//     root to follow those symlinks and bundle their TypeScript source
//     (each package's `exports` points at `./src/index.ts`).
//
//  2. pnpm's virtual store is relocated to `D:/ps` (see ../../.npmrc —
//     `virtual-store-dir=D:/ps`, a short path to dodge Windows/CMake limits).
//     react-native and its transitive deps physically live under `D:/ps/...`,
//     which is OUTSIDE the workspace root, so Metro must watch that path too or
//     resolution fails with "outside of the project root".
//
// Metro follows symlinks by default in this Expo/Metro version, so pointing it
// at these roots is enough — no extra resolver hacks.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..', '..');

// Read the relocated pnpm store from .npmrc so this stays correct if the path
// in .npmrc changes; fall back to the workspace's own node_modules/.pnpm.
const readVirtualStore = () => {
  try {
    const npmrc = fs.readFileSync(path.join(workspaceRoot, '.npmrc'), 'utf8');
    const match = npmrc.match(/^\s*virtual-store-dir\s*=\s*(.+?)\s*$/m);
    if (match && match[1]) {
      return path.resolve(workspaceRoot, match[1]);
    }
  } catch {
    // no .npmrc / unreadable — fall through to the default store location
  }
  return path.join(workspaceRoot, 'node_modules', '.pnpm');
};

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, readVirtualStore()];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// The `@aurora/*` packages are authored for NodeNext, so their internal imports
// carry explicit `.js` extensions (e.g. `export * from './model.js'`) that
// actually point at TypeScript source (`./model.ts`). Metro doesn't remap
// `.js`→`.ts` on its own, so for relative `.js` specifiers we try normal
// resolution first (real `.js` files, package assets) and, only on failure,
// retry against the `.ts`/`.tsx` source. Non-relative and non-`.js` specifiers
// go straight through the default resolver.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName, platform);
    } catch (originalError) {
      const base = moduleName.slice(0, -'.js'.length);
      for (const ext of ['.ts', '.tsx']) {
        try {
          return resolve(context, base + ext, platform);
        } catch {
          // try the next candidate extension
        }
      }
      throw originalError;
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
