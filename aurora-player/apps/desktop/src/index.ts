//
// Public surface of the desktop app's testable core (plan/05 · apps/desktop).
//
// Everything exported here is pure TypeScript — no Tauri, no libmpv — so it
// typechecks and runs in Node under Vitest. The actual Tauri/libmpv bindings
// live in `src/ui/*.example.ts` and `src-tauri/**` (excluded from the
// build/test/lint graph; wired only on a machine with the toolchain — see
// README.md).
//

// Composition root — the single place platform wiring is assembled.
export {
  createDesktopRuntime,
  type DesktopRuntime,
  type DesktopRuntimeDeps,
} from './composition/desktop-runtime.js';

// Desktop IPlayer adapter core + the libmpv seam it drives.
export { MpvPlayer } from './adapters/mpv-player.js';
export type {
  DesktopVideoCallbacks,
  DesktopVideoCommands,
  DesktopVideoSurface,
  EndFileReason,
  UnbindDesktopCallbacks,
} from './adapters/desktop-video-surface.js';

// Subtitle overlay presenter + its view-state, re-exported from the shared
// `@aurora/presentation` core (same implementation the mobile app uses).
export {
  SubtitleOverlayPresenter,
  type OverlayListener,
  type OverlayViewState,
} from '@aurora/presentation';
