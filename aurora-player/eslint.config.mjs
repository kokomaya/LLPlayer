// @ts-check
import nx from '@nx/eslint-plugin';
import tseslint from 'typescript-eslint';

/**
 * Flat ESLint config for the Aurora Player monorepo.
 *
 * The centrepiece is `@nx/enforce-module-boundaries`, which turns the
 * dependency rules from `plan/03 §3` into a build-time (CI) constraint:
 *
 *   - `layer:kernel` (domain) may depend on nothing.
 *   - `layer:domain` core packages may depend only on the kernel.
 *   - `scope:core` packages may never import a platform library
 *     (React Native / Expo / Tauri / DOM-React) — this is the DIP guard.
 *   - `scope:app` may depend on anything (composition root).
 *
 * A deliberate counter-example lives in
 * `packages/_boundary-violation-example/` and is asserted to fail lint by
 * `tools/boundary-check` — proving the guard actually bites in CI.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/coverage',
      '**/node_modules',
      '**/.nx',
      // Reference-only files kept out of the compiled/tested/linted graph:
      //  - `*.example.ts`  : the DIP counter-example prose (packages/…)
      //  - `*.example.tsx` : on-device React Native bindings in apps/mobile that
      //    import `react`/`react-native`/`react-native-video` (not installed in
      //    CI). They are validated on a device, never here — see
      //    apps/mobile/README.md.
      '**/*.example.ts',
      '**/*.example.tsx',
    ],
  },
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // `noUncheckedIndexedAccess` types every indexed access as `T | undefined`.
      // A non-null assertion immediately after an explicit bounds/loop/`findIndex`
      // check is the sanctioned companion to that flag, so this rule (on by
      // default in the Nx preset) is disabled repo-wide rather than littering the
      // core with `// eslint-disable` comments.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@nx/enforce-module-boundaries': [
        'error',
        {
          allow: [],
          depConstraints: [
            {
              sourceTag: 'layer:kernel',
              onlyDependOnLibsWithTags: ['layer:kernel'],
            },
            {
              // Hard rule (03 §3): a domain package may depend ONLY on the
              // kernel — never on another domain package (no "event soup").
              sourceTag: 'layer:domain',
              onlyDependOnLibsWithTags: ['layer:kernel'],
            },
            {
              // Presentation core (Layer 3): pure-TS view-state derivation shared
              // by every app (e.g. SubtitleOverlayPresenter). Unlike a domain
              // package it MAY compose multiple domain packages (subtitle +
              // timeline) — that is its job — so it depends on kernel + domain,
              // never on another presentation package or a platform library
              // (the latter is still barred by its `scope:core` tag below).
              sourceTag: 'layer:presentation',
              onlyDependOnLibsWithTags: ['layer:kernel', 'layer:domain'],
            },
            {
              sourceTag: 'scope:core',
              onlyDependOnLibsWithTags: ['scope:core'],
              // Platform libraries are forbidden inside the pure-TS core.
              // (Node-native infra such as better-sqlite3 is allowed: the
              // core is spec'd to run & be unit-tested under plain Node.)
              bannedExternalImports: [
                'react',
                'react-dom',
                'react-native',
                'react-native-*',
                'expo',
                'expo-*',
                '@tauri-apps/*',
                '@react-native-*/*',
              ],
            },
            {
              sourceTag: 'scope:tool',
              onlyDependOnLibsWithTags: ['scope:core', 'scope:tool'],
            },
            {
              // The composition root (apps/*) may depend on anything — internal
              // libs of any tag AND platform libraries. Platform libs are what
              // make it an app: React Native / Expo / react-native-video live
              // ONLY here. The empty `bannedExternalImports` is deliberate and
              // explicit — it documents that the platform-lib ban is a
              // scope:core rule, not an app rule. `tools/boundary-check` proves
              // the asymmetry (same lib: rejected in core, allowed in app).
              sourceTag: 'scope:app',
              onlyDependOnLibsWithTags: ['*'],
              bannedExternalImports: [],
            },
          ],
        },
      ],
    },
  },
  {
    // Core *sources* must stay platform-free even for Node built-ins. Some core
    // packages (subtitle golden tests, storage sqlite adapter) legitimately
    // need Node in their tests/adapters, so this bans built-ins only in the
    // production sources and only for the pure domain packages.
    files: [
      'packages/subtitle/src/**/*.ts',
      'packages/timeline/src/**/*.ts',
      'packages/player-api/src/**/*.ts',
    ],
    ignores: ['**/*.test.ts', '**/contract/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(node:|fs$|path$|os$|crypto$|child_process$)',
              message:
                'Core sources must stay platform-free; depend on an injected port instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // Test files may reach across for fixtures/helpers.
    files: ['**/*.test.ts', '**/contract/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
