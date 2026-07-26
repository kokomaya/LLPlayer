# Aurora Player — TypeScript core (M0 + M1 slice A)

Cross-platform, AI language-learning player engine. This monorepo is the
TypeScript **logic core** that the existing WPF app (frozen as the reference
implementation) is being migrated toward. See `../LLPlayer_Design/plan/` for the
full architecture and roadmap.

## Layout

```
packages/
  domain      shared kernel: Result, errors, value objects, events, EventBus
  subtitle    SRT + VTT → SubtitleDocument (ports & adapters, OCP registry)
  timeline    sentence cursor over timed lines (port of FlyleafLib SubManager)
  storage     KeyValueStore port + in-memory & better-sqlite3 adapters
  _boundary-violation-example   deliberate reverse example (see below)
tools/
  cli             `aurora subs show <file> --at <ms>` (pure Node, tsx)
  boundary-check  asserts the dependency guard fails on a core→platform import
samples/subtitles basic.srt / basic.vtt golden fixtures
```

## Architecture guardrails (enforced in CI)

- **Dependency direction** — `@nx/enforce-module-boundaries` (see
  `eslint.config.mjs`) turns `plan/03 §3` into a build-time rule: the kernel
  depends on nothing, a `layer:domain` package depends only on the kernel, and
  no `scope:core` package may import a platform library (React Native / Expo /
  Tauri / DOM-React). This is the DIP guard.
- **Reverse example** — `packages/_boundary-violation-example/violation.ts`
  imports `expo-sqlite` from a `scope:core` project. `tools/boundary-check`
  runs ESLint against it and asserts the violation is reported, proving the
  guard actually bites. Run it with `pnpm test:boundaries`.
- **Contract tests (LSP)** — every port ships a reusable contract suite
  (`*/contract/*`) that all implementations must pass: `ISubtitleParser`
  (SRT + VTT) and `KeyValueStore` (in-memory + SQLite).

## Commands

```bash
pnpm install
pnpm exec nx run-many -t lint typecheck test   # all quality gates
pnpm test:boundaries                            # DIP reverse example
pnpm cli subs show samples/subtitles/basic.srt --at 22000
```

## Toolchain

pnpm workspaces + Nx, TypeScript strict (NodeNext, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), Vitest (+ v8 coverage, 80% thresholds on core),
ESLint flat config, Prettier.
