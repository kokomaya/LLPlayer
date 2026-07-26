//
// ⚠️  DELIBERATE ARCHITECTURE VIOLATION — DO NOT "FIX". ⚠️
//
// This file exists solely as a reverse example proving the dependency guard
// bites in CI (plan/04 · DIP, plan/03 §3). It belongs to a `scope:core`
// project, and here it imports a platform/UI library (`react`) — exactly the
// thing the pure core is forbidden to do. `tools/boundary-check` runs ESLint
// against this file and asserts `@nx/enforce-module-boundaries` reports the
// `bannedExternalImports` violation.
//
// NOTE: `@nx/enforce-module-boundaries` only checks `bannedExternalImports`
// for packages it can resolve as external nodes in the project graph, so the
// banned package (`react`) is a real root devDependency. If it were absent the
// rule would bail early (see enforce-module-boundaries.js "we bail early") and
// the guard would silently pass — which would make this test a false negative.
//
// It has NO package.json and NO lint/test/typecheck targets, so `pnpm install`
// and `nx run-many` skip it; only the boundary-check harness ever touches it.
import { createElement } from 'react';

export const leak = createElement('div');
