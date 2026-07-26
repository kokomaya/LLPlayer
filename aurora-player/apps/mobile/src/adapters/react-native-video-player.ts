import { ValidationError, type Unsubscribe } from '@aurora/domain';
import {
  PlaybackStateMachine,
  canSeekFrom,
  type IPlayer,
  type MediaSource,
  type PlaybackState,
  type PlayerEvent,
  type PlayerListener,
  type TrackInfo,
} from '@aurora/player-api';
import type { NativeVideoSurface, UnbindCallbacks } from './native-video-surface.js';

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const toMs = (sec: number): number => Math.round(sec * 1000);
const toSec = (ms: number): number => ms / 1000;

/**
 * The Android {@link IPlayer} adapter core (plan/05 · apps/mobile). It wraps a
 * `react-native-video` handle — represented abstractly by {@link
 * NativeVideoSurface} — and translates its imperative API + callbacks into the
 * platform-agnostic player port:
 *
 *   IPlayer method  ──command──▶  <Video> handle
 *   <Video> callback ──event──▶   PlayerEvent + PlaybackStateMachine transition
 *
 * Crucially this file imports **no** platform library: the `<Video>` component
 * lives behind the surface port, so the whole adapter is pure TypeScript and can
 * be driven in Node against `FakeNativeVideoSurface`. That is what lets it run
 * the *same* `runPlayerContract` as `FakePlayer` (LSP) without a device.
 *
 * It reuses the shared {@link PlaybackStateMachine}, so its lifecycle semantics
 * are identical to every other adapter by construction.
 */
export class ReactNativeVideoPlayer implements IPlayer {
  readonly #surface: NativeVideoSurface;
  readonly #machine = new PlaybackStateMachine();
  readonly #listeners = new Set<PlayerListener>();
  readonly #unbind: UnbindCallbacks;

  #durationMs = 0;
  #mediaId = '';
  #tracks: readonly TrackInfo[] = [];
  #positionMs = 0;

  // The native `onLoad`/`onSeek` callbacks complete these promises so `open()`
  // and `seek()` resolve only once the decoder has actually reached the new
  // state (a real adapter is async here; the fake fires them synchronously).
  #pendingSource: MediaSource | null = null;
  #openResolve: (() => void) | null = null;
  #seekResolve: (() => void) | null = null;
  #seekTargetMs = 0;

  constructor(surface: NativeVideoSurface) {
    this.#surface = surface;
    this.#unbind = surface.bind({
      onLoad: (e) => this.#onLoad(e),
      onProgress: (e) => this.#onProgress(e),
      onSeek: (e) => this.#onSeek(e),
      onEnd: () => this.#onEnd(),
      onError: (e) => this.#onError(e),
      onPlaybackStateChanged: () => {
        // Advisory hint only. The PlaybackStateMachine, driven by our own
        // play/pause commands, stays the single source of truth — so we do not
        // re-emit a stateChanged here (that would double-fire on every action).
      },
      onBuffer: () => {
        // Advisory hint only; buffering is not a distinct lifecycle state in the
        // port. A future ISupportsBuffering sub-interface could surface it.
      },
    });
  }

  get state(): PlaybackState {
    return this.#machine.state;
  }

  duration(): number {
    return this.#durationMs;
  }

  position(): number {
    return this.#positionMs;
  }

  subscribe(listener: PlayerListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  async open(source: MediaSource): Promise<void> {
    const openedFrom = this.#dispatchOrThrow('open').from;
    this.#emit({ type: 'stateChanged', from: openedFrom, to: 'opening' });
    this.#pendingSource = source;
    return new Promise<void>((resolve) => {
      this.#openResolve = resolve;
      // Real RN responds asynchronously with onLoad/onError; the fake responds
      // synchronously, so resolve happens before this executor returns.
      this.#surface.commands.load(source.uri);
    });
  }

  async play(): Promise<void> {
    if (this.#machine.state === 'playing') {
      return; // idempotent
    }
    const t = this.#dispatchOrThrow('play');
    this.#surface.commands.play();
    this.#emit({ type: 'stateChanged', from: t.from, to: t.to });
  }

  async pause(): Promise<void> {
    if (this.#machine.state === 'paused') {
      return; // idempotent
    }
    const t = this.#dispatchOrThrow('pause');
    this.#surface.commands.pause();
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
    return new Promise<void>((resolve) => {
      this.#seekResolve = resolve;
      this.#seekTargetMs = target;
      this.#surface.commands.seek(toSec(target));
    });
  }

  setSpeed(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ValidationError(`Playback rate must be > 0 (got ${rate})`);
    }
    this.#surface.commands.setRate(rate);
  }

  dispose(): void {
    this.#machine.dispatch('dispose');
    this.#unbind();
    this.#surface.commands.release();
    this.#listeners.clear();
    this.#durationMs = 0;
    this.#positionMs = 0;
  }

  // --- native callback handlers ---------------------------------------------

  #onLoad(event: { readonly duration: number; readonly currentTime?: number }): void {
    if (this.#machine.state !== 'opening') {
      return; // stray load after dispose/retry
    }
    const source = this.#pendingSource;
    const nativeMs = event.duration > 0 ? toMs(event.duration) : 0;
    const durationMs = nativeMs > 0 ? nativeMs : source?.durationMs ?? 0;

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      // Bad media is an operational failure, not illegal API usage: surface via
      // the error state + event and resolve open() (mirrors FakePlayer).
      this.#machine.dispatch('openFailed');
      this.#emit({ type: 'stateChanged', from: 'opening', to: 'error' });
      this.#emit({
        type: 'error',
        message: `Cannot open "${source?.id ?? '?'}": unknown/invalid duration`,
      });
      this.#resolveOpen();
      return;
    }

    this.#durationMs = durationMs;
    this.#mediaId = source?.id ?? '';
    this.#tracks = source?.tracks ?? [];
    this.#positionMs = toMs(event.currentTime ?? 0);

    this.#machine.dispatch('opened');
    this.#emit({ type: 'stateChanged', from: 'opening', to: 'ready' });
    this.#emit({
      type: 'opened',
      mediaId: this.#mediaId,
      durationMs: this.#durationMs,
      tracks: this.#tracks,
    });
    this.#resolveOpen();
  }

  #onProgress(event: { readonly currentTime: number }): void {
    if (this.#machine.state !== 'playing') {
      return; // ignore progress that is not from live playback
    }
    this.#positionMs = clamp(toMs(event.currentTime), 0, this.#durationMs);
    this.#emit({ type: 'positionChanged', positionMs: this.#positionMs });
  }

  #onSeek(event: { readonly currentTime: number }): void {
    // While our own seek() is in flight, trust the clamped target we issued
    // (handles target 0 too); an unsolicited seek falls back to the reported
    // time.
    const target =
      this.#seekResolve !== null
        ? this.#seekTargetMs
        : clamp(toMs(event.currentTime), 0, this.#durationMs);
    this.#positionMs = target;
    const t = this.#machine.dispatch('seek');
    if (t.ok && t.value.from !== t.value.to) {
      this.#emit({ type: 'stateChanged', from: t.value.from, to: t.value.to });
    }
    this.#emit({ type: 'seeked', positionMs: target });
    this.#resolveSeek();
  }

  #onEnd(): void {
    if (this.#machine.state !== 'playing') {
      return;
    }
    this.#positionMs = this.#durationMs;
    this.#machine.dispatch('end');
    this.#emit({ type: 'positionChanged', positionMs: this.#durationMs });
    this.#emit({ type: 'stateChanged', from: 'playing', to: 'ended' });
    this.#emit({ type: 'ended' });
  }

  #onError(event: { readonly error: { readonly errorString?: string } }): void {
    const message = event.error.errorString ?? 'playback error';
    if (this.#machine.state === 'opening') {
      this.#machine.dispatch('openFailed');
      this.#emit({ type: 'stateChanged', from: 'opening', to: 'error' });
      this.#emit({ type: 'error', message });
      this.#resolveOpen();
      return;
    }
    if (this.#machine.can('fail')) {
      const from = this.#machine.state;
      this.#machine.dispatch('fail');
      this.#emit({ type: 'stateChanged', from, to: 'error' });
    }
    this.#emit({ type: 'error', message });
  }

  // --- helpers ---------------------------------------------------------------

  #resolveOpen(): void {
    const resolve = this.#openResolve;
    this.#openResolve = null;
    this.#pendingSource = null;
    resolve?.();
  }

  #resolveSeek(): void {
    const resolve = this.#seekResolve;
    this.#seekResolve = null;
    this.#seekTargetMs = 0;
    resolve?.();
  }

  #dispatchOrThrow(action: 'open' | 'play' | 'pause') {
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
