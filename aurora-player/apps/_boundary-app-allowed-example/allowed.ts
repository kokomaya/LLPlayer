//
// ✅  DELIBERATE POSITIVE EXAMPLE — DO NOT "FIX" by removing the react import. ✅
//
// This file is the mirror image of `packages/_boundary-violation-example`
// (plan/04 · DIP, plan/03 §3). It belongs to a `scope:app` project — the
// composition root — where platform/UI libraries ARE permitted. Importing
// `react` here MUST lint clean, proving the dependency guard is asymmetric:
//
//   scope:core imports react  → ESLint FAILS (bannedExternalImports)
//   scope:app  imports react  → ESLint PASSES (no such ban)
//
// `tools/boundary-check` asserts both directions, so the asymmetry can never
// silently regress (e.g. if someone adds a blanket platform-lib ban).
//
// Like the violation fixture it has NO package.json and NO lint/test/typecheck
// targets, so `pnpm install` and `nx run-many` skip it; only the boundary-check
// harness ever lints it. `react` is a real root devDependency, so the rule can
// resolve it as an external node (otherwise the check would be a false pass).
import { createElement } from 'react';

export const ok = createElement('div');
