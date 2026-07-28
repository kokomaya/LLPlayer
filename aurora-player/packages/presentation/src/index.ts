//
// Public surface of the shared presentation core (plan/05 · Layer 3).
//
// Pure TypeScript — no React / React Native / Tauri — so it typechecks and runs
// in Node under Vitest and can be consumed by every app composition root. Both
// `apps/mobile` and `apps/desktop` render the same `OverlayViewState` produced
// here; the platform bindings only differ in how they paint it.
//
export {
  SubtitleOverlayPresenter,
  type OverlayListener,
  type OverlayViewState,
} from './subtitle-overlay-presenter.js';

// Word-addressable multi-mode subtitle surface (list / fullscreen), shared by
// mobile and desktop. Pure builders + a position-driven presenter; the platform
// binding maps its own gestures (tap/click → seek, long-press/right-click →
// menu) onto the same view-state.
export {
  buildSubtitleLineVMs,
  computeLineWindow,
  type LineWindow,
  type SubtitleDisplayMode,
  type SubtitleLineVM,
  type SubtitleWordVM,
} from './subtitle-view.js';
export {
  SubtitleListPresenter,
  type SubtitleListListener,
  type SubtitleListOptions,
  type SubtitleListViewState,
} from './subtitle-list-presenter.js';
