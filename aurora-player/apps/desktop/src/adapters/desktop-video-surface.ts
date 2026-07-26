/**
 * The seam between the pure {@link MpvPlayer} adapter core and the desktop video
 * backend (plan/04 · Ports & Adapters). On a real machine the backend is
 * libmpv, driven over Tauri IPC (`src/ui/tauri-mpv-surface.example.ts`); tests
 * drive it with `FakeDesktopVideoSurface`. The adapter core never imports Tauri
 * or libmpv — it only speaks this port.
 *
 * This surface is intentionally shaped like **libmpv**, NOT like
 * `react-native-video` (the mobile surface). Two differences matter, and they
 * are the whole point of M3 — they force the adapter to *map* a differently
 * shaped backend onto the same `IPlayer`, proving OCP/LSP rather than reskinning:
 *
 *   1. Play/pause is a single `set pause yes|no` property, not two commands.
 *   2. Termination is one `end-file` event carrying a `reason`, not separate
 *      `onEnd` / `onError` callbacks. The adapter demultiplexes it.
 *
 * As in mpv, all times are in **seconds** (fractional). Converting to the ms the
 * domain uses is the adapter core's job.
 */

/** Imperative commands the core sends to the libmpv handle. */
export interface DesktopVideoCommands {
  /** `loadfile <uri>`; the backend responds by firing `onFileLoaded`. */
  loadFile(uri: string): void;
  /** `set pause yes|no` — the unified play/pause control. */
  setPaused(paused: boolean): void;
  /** `seek <sec> absolute+exact`; responds with `onSeekFinished`. */
  seekAbsolute(positionSec: number): void;
  /** `set speed <n>` (1 = normal). */
  setSpeed(rate: number): void;
  /** Destroy the mpv handle / drop the render context. */
  destroy(): void;
}

/** Why playback of the current file ended (mpv `MPV_EVENT_END_FILE.reason`). */
export type EndFileReason = 'eof' | 'error' | 'stop';

/**
 * Callbacks the libmpv event loop invokes. Field shapes are the subset of mpv's
 * property-change / event payloads the adapter actually consumes.
 */
export interface DesktopVideoCallbacks {
  /** File loaded; `duration`/`time-pos` in seconds. */
  onFileLoaded(event: { readonly durationSec: number; readonly positionSec?: number }): void;
  /** `time-pos` property changed while playing; seconds. */
  onTimePos(event: { readonly positionSec: number }): void;
  /** A requested seek settled; `time-pos` in seconds. */
  onSeekFinished(event: { readonly positionSec: number }): void;
  /**
   * The current file ended. `reason` demultiplexes the outcome:
   *   - `'eof'`   → played to the end,
   *   - `'error'` → decode/IO failure (`error` carries the message),
   *   - `'stop'`  → deliberately stopped (e.g. replaced/destroyed) — ignored.
   */
  onEndFile(event: { readonly reason: EndFileReason; readonly error?: string }): void;
}

/** Handle unbinding a set of callbacks from the surface. */
export type UnbindDesktopCallbacks = () => void;

/**
 * A bound libmpv handle: the adapter core drives {@link commands} and subscribes
 * to callbacks via {@link bind}.
 */
export interface DesktopVideoSurface {
  readonly commands: DesktopVideoCommands;
  bind(callbacks: DesktopVideoCallbacks): UnbindDesktopCallbacks;
}
