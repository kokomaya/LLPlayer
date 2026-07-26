import { ValidationError, type Unsubscribe } from '@aurora/domain';
import type { Clock } from './clock.js';
import type {
  MediaSource,
  PlaybackState,
  PlayerEvent,
  PlayerListener,
  TrackInfo,
} from './model.js';
import { PlaybackStateMachine, canSeekFrom } from './state-machine.js';

export interface FakePlayerOptions {
  /** Injected logical clock — the player derives position from it (no Date.now). */
  readonly clock: Clock;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * An in-memory {@link IPlayer} with no real decoding. Position is derived purely
 * from the injected {@link Clock}, so playback is deterministic: advance the
 * clock and call {@link FakePlayer.tick} to emit the events a real frame
 * callback would. It exists to (a) prove the port + state machine are coherent
 * via the shared contract and (b) drive the CLI `play` command in pure Node.
 *
 * `tick()` is *not* part of {@link IPlayer}: it is the driver seam a real
 * adapter fills with its own frame/timer loop.
 */
export class FakePlayer {
  readonly #clock: Clock;
  readonly #machine = new PlaybackStateMachine();
  readonly #listeners = new Set<PlayerListener>();

  #durationMs = 0;
  #mediaId = '';
  #tracks: readonly TrackInfo[] = [];
  #speed = 1;

  // Position model: while `playing`, position = anchorPos + elapsed*speed;
  // otherwise the frozen `#positionMs` committed at the last pause/seek.
  #positionMs = 0;
  #anchorPositionMs = 0;
  #anchorClockMs = 0;

  constructor(options: FakePlayerOptions) {
    this.#clock = options.clock;
  }

  get state(): PlaybackState {
    return this.#machine.state;
  }

  duration(): number {
    return this.#durationMs;
  }

  position(): number {
    if (this.#machine.state !== 'playing') {
      return this.#positionMs;
    }
    const elapsed = this.#clock.now() - this.#anchorClockMs;
    return clamp(this.#anchorPositionMs + elapsed * this.#speed, 0, this.#durationMs);
  }

  subscribe(listener: PlayerListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async open(source: MediaSource): Promise<void> {
    // `open` is legal from `idle` or `error`; capture which before transitioning
    // so the emitted `stateChanged.from` is accurate.
    const openedFrom = this.#dispatchOrThrow('open').from;
    this.#emit({ type: 'stateChanged', from: openedFrom, to: 'opening' });

    const durationMs = source.durationMs ?? 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      // Operational failure (bad media), not illegal API usage: surface via the
      // error state + event rather than rejecting the promise.
      this.#machine.dispatch('openFailed');
      this.#emit({ type: 'stateChanged', from: 'opening', to: 'error' });
      this.#emit({
        type: 'error',
        message: `Cannot open "${source.id}": unknown/invalid duration`,
      });
      return;
    }

    this.#durationMs = durationMs;
    this.#mediaId = source.id;
    this.#tracks = source.tracks ?? [];
    this.#positionMs = 0;
    this.#speed = 1;

    this.#machine.dispatch('opened');
    this.#emit({ type: 'stateChanged', from: 'opening', to: 'ready' });
    this.#emit({
      type: 'opened',
      mediaId: this.#mediaId,
      durationMs: this.#durationMs,
      tracks: this.#tracks,
    });
  }

  async play(): Promise<void> {
    if (this.#machine.state === 'playing') {
      return; // idempotent
    }
    const t = this.#dispatchOrThrow('play');
    this.#anchorPositionMs = this.#positionMs;
    this.#anchorClockMs = this.#clock.now();
    this.#emit({ type: 'stateChanged', from: t.from, to: t.to });
  }

  async pause(): Promise<void> {
    if (this.#machine.state === 'paused') {
      return; // idempotent
    }
    // Commit the live position before leaving the playing state.
    this.#positionMs = this.position();
    const t = this.#dispatchOrThrow('pause');
    this.#emit({ type: 'stateChanged', from: t.from, to: t.to });
  }

  async seek(positionMs: number): Promise<void> {
    if (!canSeekFrom(this.#machine.state)) {
      throw new ValidationError(
        `Cannot seek from "${this.#machine.state}" (no media loaded)`,
      );
    }
    const target = clamp(Math.round(positionMs), 0, this.#durationMs);
    this.#emit({ type: 'seeking', positionMs: target });

    const wasPlaying = this.#machine.state === 'playing';
    this.#positionMs = target;
    if (wasPlaying) {
      this.#anchorPositionMs = target;
      this.#anchorClockMs = this.#clock.now();
    }

    const t = this.#dispatchOrThrow('seek');
    if (t.from !== t.to) {
      this.#emit({ type: 'stateChanged', from: t.from, to: t.to });
    }
    this.#emit({ type: 'seeked', positionMs: target });
  }

  setSpeed(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ValidationError(`Playback rate must be > 0 (got ${rate})`);
    }
    if (this.#machine.state === 'playing') {
      // Re-anchor so already-elapsed time keeps the old rate.
      this.#positionMs = this.position();
      this.#anchorPositionMs = this.#positionMs;
      this.#anchorClockMs = this.#clock.now();
    }
    this.#speed = rate;
  }

  /**
   * Advance emitted state to the current clock: fire `positionChanged`, and roll
   * over to `ended` when the position reaches the duration. A no-op unless
   * playing. Call after advancing the injected clock.
   */
  tick(): void {
    if (this.#machine.state !== 'playing') {
      return;
    }
    const pos = this.position();
    if (pos >= this.#durationMs) {
      this.#positionMs = this.#durationMs;
      this.#machine.dispatch('end');
      this.#emit({ type: 'positionChanged', positionMs: this.#durationMs });
      this.#emit({ type: 'stateChanged', from: 'playing', to: 'ended' });
      this.#emit({ type: 'ended' });
      return;
    }
    this.#emit({ type: 'positionChanged', positionMs: pos });
  }

  dispose(): void {
    this.#machine.dispatch('dispose');
    this.#listeners.clear();
    this.#durationMs = 0;
    this.#positionMs = 0;
  }

  #dispatchOrThrow(action: 'open' | 'play' | 'pause' | 'seek') {
    const result = this.#machine.dispatch(action);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  }

  #emit(event: PlayerEvent): void {
    for (const listener of [...this.#listeners]) {
      listener(event);
    }
  }
}
