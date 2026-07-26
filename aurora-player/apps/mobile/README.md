# @aurora/mobile

Expo (Android-first) shell for Aurora Player. This is the mobile **composition
root** — the one `scope:app` project where platform libraries (`react`,
`react-native`, `react-native-video`, `expo`) are allowed to appear. Every other
package stays pure and platform-free (enforced by `@nx/enforce-module-boundaries`;
see `tools/boundary-check`).

## What lives here, and why it splits in two

| Kind | Files | In CI? | Notes |
|------|-------|:------:|-------|
| **Testable core (pure TS)** | `src/adapters/*.ts`, `src/composition/*.ts`, `src/index.ts` | ✅ lint · typecheck · test | No React/RN imports. Runs in Node under Vitest. |
| **Native bindings (reference)** | `src/ui/*.example.tsx` | ❌ excluded | Thin `<Video>`/overlay leaves. Device-only. |

> The subtitle overlay presenter is **not** in this app: it lives in the shared
> `@aurora/presentation` core (`packages/presentation`) so `apps/mobile` and
> `apps/desktop` render the same `OverlayViewState`. Mobile re-exports it from
> `src/index.ts` for convenience.

The `.example.tsx` files are **deliberately excluded** from the build/test/lint
graph because `react`, `react-native`, and `react-native-video` are heavy,
device-only dependencies that are **not installed** in this repo:

- `tsconfig.json` → `include: ["src/**/*.ts"]` (no `.tsx`)
- `eslint.config.mjs` → global ignore `**/*.example.tsx`
- `vitest.config.ts` → coverage excludes `src/**/*.example.*`

This is the ports-&-adapters payoff: the native `<Video>` component sits behind
the `NativeVideoSurface` port (`src/adapters/native-video-surface.ts`), so the
**entire** Android `IPlayer` adapter (`ReactNativeVideoPlayer`) is pure
TypeScript and passes the same `runPlayerContract` as `FakePlayer` — driven in
Node by `FakeNativeVideoSurface`, no device needed.

## Architecture (one glance)

```
FakeNativeVideoSurface / <Video>   ← native seam (seconds)
        │  NativeVideoSurface port
        ▼
ReactNativeVideoPlayer  (IPlayer, pure TS, shared PlaybackStateMachine)
        │  PlayerEvent
        ▼
createPlayerRuntime  ──bridge──▶  EventBus  (PositionChanged / MediaOpened)
        │                              │
        │                              ▼
        │                     SubtitleOverlayPresenter (SubtitleTimeline + WordCursor)
        │                              │  OverlayViewState
        ▼                              ▼
   <VideoScreen>                 <SubtitleOverlay>   ← dumb .example.tsx leaves
```

## CI (what runs green here)

```bash
pnpm exec nx run-many -t lint typecheck test   # includes `mobile`
```

- `runPlayerContract` proves `ReactNativeVideoPlayer` is LSP-substitutable for
  `FakePlayer` (`src/adapters/react-native-video-player.test.ts`).
- The composition root is Node-tested against fakes and the golden subtitle
  fixtures (`src/composition/integration.test.ts`); the presenter itself is
  tested in `packages/presentation`.
- Coverage of the pure core is ≥ 80% (native bindings + `src/ui/**` + `src/index.ts`
  are explicitly excluded — they are validated on device, below).

## On-device build (NOT in CI — manual)

These steps require a real Android device/emulator and the device-only deps.

```bash
# 1. From apps/mobile — install the platform libraries omitted from CI.
pnpm add expo react react-native react-native-video

# 2. Promote the reference bindings to real source.
#    (drop the `.example` segment from the filename AND from their imports)
cp src/ui/VideoScreen.example.tsx   src/ui/VideoScreen.tsx
cp src/ui/SubtitleOverlay.example.tsx src/ui/SubtitleOverlay.tsx
#    then edit the two new files: `./SubtitleOverlay.example.js` → `./SubtitleOverlay.js`

# 3. Generate native projects and run on Android.
pnpm exec expo prebuild -p android
pnpm exec expo run:android
```

#### iOS (same adapter, no new architecture)

iOS reuses the **exact same** `react-native-video` adapter and testable core —
there is no separate iOS code path, so it adds no CI project. Validate it on a
Mac with the identical steps, swapping the platform flag:

```bash
pnpm exec expo prebuild -p ios
pnpm exec expo run:ios
```

Then run the same acceptance checklist below on the iOS build.

### Manual acceptance checklist (run on device)

Load a sample clip plus a WhisperX JSON and an SRT for the same media:

- [ ] Video plays; the subtitle line under the video matches the spoken sentence.
- [ ] With **WhisperX** (word timings): the highlighted word advances word-by-word
      in sync with speech (real, non-estimated highlight).
- [ ] With **SRT** (sentence-only): words are shown but **not** per-word
      highlighted (estimated → italic, no accent colour).
- [ ] Seeking (scrub) jumps both video and the highlighted word to the new time.
- [ ] Pause freezes the highlight; resume continues from the same word.
- [ ] Reaching the end stops playback with no overlay flicker.
- [ ] Backgrounding/foregrounding the app does not desync the overlay.

> Keep `src/ui/*.tsx` (the promoted files) **out of version control** unless the
> team decides to install the native deps in CI — otherwise they'll break the
> pure-core lint/typecheck gate. Only the `.example.tsx` references are committed.
