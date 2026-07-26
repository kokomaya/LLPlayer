import type { Unsubscribe } from '@aurora/domain';
import type {
  MediaSource,
  PlaybackState,
  PlayerListener,
  TrackInfo,
} from './model.js';

/**
 * The minimal player port (plan/05 · player-api). Deliberately small (ISP):
 * transport + position + a single event stream. Optional capabilities live in
 * the `ISupports*` sub-interfaces below so an adapter only advertises what it
 * actually does.
 *
 * Lifecycle methods that a real decoder performs asynchronously return
 * `Promise<void>`; illegal usage (e.g. `play()` before `open()`) rejects with a
 * `ValidationError`. Operational failures instead surface as an `error` event
 * and move the player to the `error` state.
 */
export interface IPlayer {
  /** Current lifecycle state. */
  readonly state: PlaybackState;

  /** Current playback position in ms (live while `playing`). */
  position(): number;
  /** Total media duration in ms, or 0 before a source is opened. */
  duration(): number;

  open(source: MediaSource): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  /** Reposition to `positionMs` (clamped to `[0, duration]`). */
  seek(positionMs: number): Promise<void>;
  /** Set the playback rate (must be > 0; 1 = normal speed). */
  setSpeed(rate: number): void;

  /** Subscribe to the event stream; returns an unsubscribe handle. */
  subscribe(listener: PlayerListener): Unsubscribe;

  /** Release resources and return to `idle`. */
  dispose(): void;
}

/** Optional: media exposes navigable chapters. */
export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly startMs: number;
}
export interface ISupportsChapters {
  chapters(): readonly Chapter[];
}

/** Optional: capture the current frame as encoded image bytes. */
export interface ISupportsSnapshot {
  snapshot(): Promise<Uint8Array>;
}

/** Optional: picture-in-picture. */
export interface ISupportsPiP {
  enterPiP(): Promise<void>;
  exitPiP(): Promise<void>;
}

/** Optional: record the current stream to a file/buffer. */
export interface ISupportsRecording {
  startRecording(): Promise<void>;
  stopRecording(): Promise<Uint8Array>;
}

// --- Capability type-guards (ISP made checkable at the composition root) ---

export const supportsChapters = (
  player: IPlayer,
): player is IPlayer & ISupportsChapters =>
  typeof (player as Partial<ISupportsChapters>).chapters === 'function';

export const supportsSnapshot = (
  player: IPlayer,
): player is IPlayer & ISupportsSnapshot =>
  typeof (player as Partial<ISupportsSnapshot>).snapshot === 'function';

export const supportsPiP = (
  player: IPlayer,
): player is IPlayer & ISupportsPiP =>
  typeof (player as Partial<ISupportsPiP>).enterPiP === 'function' &&
  typeof (player as Partial<ISupportsPiP>).exitPiP === 'function';

export const supportsRecording = (
  player: IPlayer,
): player is IPlayer & ISupportsRecording =>
  typeof (player as Partial<ISupportsRecording>).startRecording === 'function' &&
  typeof (player as Partial<ISupportsRecording>).stopRecording === 'function';

/** Re-export for adapters building `opened` payloads without a deep import. */
export type { TrackInfo };
