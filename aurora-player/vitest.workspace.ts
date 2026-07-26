import { defineWorkspace } from 'vitest/config';

// Aggregates every package's vitest config so the whole monorepo can be run
// with a single `vitest` invocation (Nx still runs them per-project for
// `affected`). Each project sets its own coverage thresholds.
export default defineWorkspace([
  'packages/*',
  'tools/*',
  'apps/*',
]);
