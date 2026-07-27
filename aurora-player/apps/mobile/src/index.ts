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

// Epic A learning gestures (word-step seek + subtitle copy). Headless so the
// device UI stays a thin button layer; also reachable via `runtime.controls`.
export {
  createLearningControls,
  type LearningControls,
} from './composition/learning-controls.js';

// Epic A/C source-selection consent gate: decide whether a local/URL/package
// pick may play, and what `network` consent is missing if not. Reuses the
// canonical privacy gate — no logic re-implemented in the UI.
export {
  STREAMING_DATA_USES,
  decidePlayback,
  type PlaybackDecision,
} from './composition/source-gate.js';

// Epic C marketplace controller: browse / detail / consent-gated play / upload
// over the ICatalogBackend port. Headless so the store screen stays a thin
// list+button layer; the concrete HTTP backend is injected on device.
export {
  createMarketplaceControls,
  type MarketplaceControls,
  type PackagePlayback,
} from './composition/marketplace-controls.js';

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
