# @aurora/desktop

Tauri (libmpv) shell for Aurora Player. This is the desktop **composition
root** — the second `scope:app` project (after `apps/mobile`), where platform
libraries (`@tauri-apps/*`) are allowed to appear. Every core package stays pure
and platform-free (enforced by `@nx/enforce-module-boundaries`; see
`tools/boundary-check`).

Its reason to exist is to prove the architecture with a **heterogeneous
backend**: libmpv looks nothing like `react-native-video`, yet the desktop
`IPlayer` (`MpvPlayer`) passes the *same* `runPlayerContract` and reuses the
*same* shared `SubtitleOverlayPresenter` — **without changing a single line of
any core package** (OCP), and as a drop-in substitute for the port (LSP).

## What lives here, and why it splits in two

| Kind | Files | In CI? | Notes |
|------|-------|:------:|-------|
| **Testable core (pure TS)** | `src/adapters/*.ts`, `src/composition/*.ts`, `src/index.ts` | ✅ lint · typecheck · test | No Tauri/libmpv imports. Runs in Node under Vitest. |
| **Native bindings (reference)** | `src/ui/*.example.ts`, `src-tauri/**` | ❌ excluded | Thin Tauri-IPC / mpv leaves + Rust. Machine-only. |

The overlay presenter is **not** here — it lives in the shared
`@aurora/presentation` core and is re-exported from `src/index.ts`, so mobile and
desktop paint the identical `OverlayViewState`.

The `.example.ts` files and `src-tauri/**` are **deliberately excluded** from the
build/test/lint graph because `@tauri-apps/api` and libmpv are machine/toolchain
dependencies that are **not installed** in this repo:

- `tsconfig.json` → `include: ["src/**/*.ts"]`, `exclude: ["src/**/*.example.ts", "src-tauri"]`
- `eslint.config.mjs` → global ignore `**/*.example.ts`
- `vitest.config.ts` → coverage excludes `src/ui/**` and `src/**/*.example.*`

This is the ports-&-adapters payoff: libmpv sits behind the `DesktopVideoSurface`
port (`src/adapters/desktop-video-surface.ts`), so the **entire** desktop
`IPlayer` adapter (`MpvPlayer`) is pure TypeScript and is driven in Node by
`FakeDesktopVideoSurface`, no machine needed.

## Architecture (one glance)

```
FakeDesktopVideoSurface / libmpv (over Tauri IPC)   ← native seam (seconds)
        │  DesktopVideoSurface port (set pause / seek / end-file{reason})
        ▼
MpvPlayer  (IPlayer, pure TS, shared PlaybackStateMachine)
        │  PlayerEvent
        ▼
createDesktopRuntime  ──bridge──▶  EventBus  (PositionChanged / MediaOpened)
        │                              │
        │                              ▼
        │                     SubtitleOverlayPresenter  ← shared @aurora/presentation
        │                              │  OverlayViewState
        ▼                              ▼
   Tauri window                 renderSubtitleOverlay   ← dumb .example.ts leaf
```

### How the backend differs from mobile (why this proves OCP/LSP)

| Concern | mobile (`react-native-video`) | desktop (`libmpv`) |
|---|---|---|
| play / pause | two commands (`play()`, `pause()`) | one property (`set pause yes\|no`) |
| end / error | two callbacks (`onEnd`, `onError`) | one `end-file` event with a `reason` |
| times | seconds | seconds |

`MpvPlayer` maps this different shape onto the shared machine + port. Nothing
downstream (`PlaybackStateMachine`, `IPlayer`, the presenter, the bus) changed.

## CI (what runs green here)

```bash
pnpm exec nx run-many -t lint typecheck test   # includes `desktop`
```

- `runPlayerContract` proves `MpvPlayer` is LSP-substitutable for `FakePlayer`
  and `ReactNativeVideoPlayer` (`src/adapters/mpv-player.test.ts`).
- The composition root is Node-tested against fakes and the golden subtitle
  fixtures (`src/composition/integration.test.ts`), asserting the overlay stream
  matches the mobile golden.
- Coverage of the pure core is ≥ 80% (native bindings + `src/ui/**` +
  `src/index.ts` are explicitly excluded — validated on a machine, below).

## On-machine build (NOT in CI — manual)

These steps require a Rust toolchain, a system WebView, and libmpv.

```bash
# 1. From apps/desktop — install the platform libraries omitted from CI.
pnpm add @tauri-apps/api
pnpm add -D @tauri-apps/cli

# 2. Promote the reference bindings to real source (drop the `.example` segment
#    from each filename AND from their imports), and scaffold the Rust side:
#    src-tauri/{Cargo.toml,tauri.conf.json,src/main.rs}, rename
#    src-tauri/src/lib.example.rs -> lib.rs, add a libmpv crate (e.g. libmpv2).

# 3. Run the desktop app.
pnpm tauri dev
```

### Manual acceptance checklist (run on a machine)

Open a local clip plus a WhisperX JSON and an SRT for the same media:

- [ ] Video plays; the subtitle line matches the spoken sentence.
- [ ] With **WhisperX** (word timings): the highlighted word advances word-by-word
      in sync with speech (real, non-estimated highlight).
- [ ] With **SRT** (sentence-only): words are shown but **not** per-word
      highlighted (estimated → no accent colour).
- [ ] Seeking jumps both video and the highlighted word to the new time.
- [ ] Pause freezes the highlight; resume continues from the same word.
- [ ] Playback rate (speed) applies and the overlay keeps sync.
- [ ] Reaching the end stops playback with no overlay flicker.

> Keep the promoted `src/ui/*.ts` and `src-tauri/**` build files **out of the CI
> lint/typecheck gate** unless the team installs the native deps in CI —
> otherwise they break the pure-core gate. Only the `.example.ts` references and
> `lib.example.rs` are committed. Never commit signing keys / API keys.
