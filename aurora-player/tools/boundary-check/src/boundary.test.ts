import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

// Repo root of the aurora-player workspace (…/aurora-player).
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const VIOLATION = 'packages/_boundary-violation-example/violation.ts';
const CLEAN = 'packages/domain/src/index.ts';
// Same platform-lib import as VIOLATION, but from a `scope:app` project where it
// is allowed — proves the guard is asymmetric (core denies, app permits).
const APP_ALLOWED = 'apps/_boundary-app-allowed-example/allowed.ts';

interface EslintRun {
  readonly failed: boolean;
  readonly output: string;
}

const runEslint = (target: string): EslintRun => {
  try {
    execSync(`pnpm exec eslint "${target}"`, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { failed: false, output: '' };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { failed: true, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

describe('@nx/enforce-module-boundaries guard (reverse example)', () => {
  beforeAll(() => {
    // `@nx/enforce-module-boundaries` only runs when a project graph is
    // cached; a standalone `eslint` invocation with a cold cache silently
    // *skips* the rule ("No cached ProjectGraph is available"). Warm it so
    // the guard is actually exercised — otherwise this test is a false pass.
    execSync('pnpm exec nx show projects', {
      cwd: repoRoot,
      stdio: 'ignore',
    });
  });

  it('FAILS lint when a scope:core package imports a platform library', () => {
    const { failed, output } = runEslint(VIOLATION);
    expect(failed, `expected ESLint to fail on ${VIOLATION}`).toBe(true);
    expect(output).toMatch(
      /enforce-module-boundaries|not allowed to import|scope:core/i,
    );
  });

  it('PASSES lint for a compliant core package (control)', () => {
    // Proves the guard is discriminating, not failing everything.
    const { failed } = runEslint(CLEAN);
    expect(failed, 'expected the compliant domain source to lint clean').toBe(
      false,
    );
  });

  it('PASSES lint when a scope:app package imports the SAME platform library', () => {
    // The composition root is exempt: the ban is a scope:core rule, not a
    // blanket one. Same `react` import that fails in core must pass here.
    const { failed, output } = runEslint(APP_ALLOWED);
    expect(
      failed,
      `expected the scope:app fixture to lint clean, got:\n${output}`,
    ).toBe(false);
  });
});
