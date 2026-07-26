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
