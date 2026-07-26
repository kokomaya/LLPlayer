//
// Public surface of the mobile app's testable core (plan/05 · apps/mobile).
//
// Everything exported here is pure TypeScript — no React, no react-native, no
// react-native-video — so it typechecks and runs in Node under Vitest. The
// actual native bindings live in `src/ui/*.example.tsx` (excluded from the
// build/test/lint graph; wired only on device — see README.md).
//

// Composition root — the single place platform wiring is assembled.
export {
  createPlayerRuntime,
  type PlayerRuntime,
  type PlayerRuntimeDeps,
} from './composition/player-runtime.js';

// Android IPlayer adapter core + the native `<Video>` seam it drives.
export { ReactNativeVideoPlayer } from './adapters/react-native-video-player.js';
export type {
  NativeVideoCallbacks,
  NativeVideoCommands,
  NativeVideoSurface,
  UnbindCallbacks,
} from './adapters/native-video-surface.js';

// Subtitle overlay presenter + its view-state (what `<SubtitleOverlay>` renders).
// Re-exported from the shared `@aurora/presentation` core — mobile and desktop
// consume the exact same implementation.
export {
  SubtitleOverlayPresenter,
  type OverlayListener,
  type OverlayViewState,
} from '@aurora/presentation';
