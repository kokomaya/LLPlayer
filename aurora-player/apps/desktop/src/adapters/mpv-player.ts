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
import type {
  DesktopVideoSurface,
  EndFileReason,
  UnbindDesktopCallbacks,
} from './desktop-video-surface.js';

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const toMs = (sec: number): number => Math.round(sec * 1000);
const toSec = (ms: number): number => ms / 1000;

/**
 * The desktop {@link IPlayer} adapter core (plan/05 · apps/desktop). It wraps a
 * libmpv handle — represented abstractly by {@link DesktopVideoSurface} — and
 * translates its property/command model into the platform-agnostic player port:
 *
 *   IPlayer method  ──command──▶  mpv handle (loadfile / set pause / seek)
 *   mpv event       ──event──▶    PlayerEvent + PlaybackStateMachine transition
 *
 * It is the THIRD `IPlayer` implementation (after `FakePlayer` and mobile's
 * `ReactNativeVideoPlayer`) and passes the SAME `runPlayerContract` — the
 * concrete proof of LSP and OCP: a heterogeneous backend (single `set pause`
 * property + one `end-file` event with a reason, vs RN's two commands and two
 * callbacks) is mapped here without touching the shared machine or the port.
 *
 * Like the mobile adapter it imports **no** platform library: libmpv/Tauri sit
 * behind the surface port, so the whole class is pure TypeScript and runs in
 * Node against `FakeDesktopVideoSurface`.
 */
export class MpvPlayer implements IPlayer {
  readonly #surface: DesktopVideoSurface;
  readonly #machine = new PlaybackStateMachine();
  readonly #listeners = new Set<PlayerListener>();
  readonly #unbind: UnbindDesktopCallbacks;

  #durationMs = 0;
  #mediaId = '';
  #tracks: readonly TrackInfo[] = [];
  #positionMs = 0;

  // Resolved by the mpv callbacks so open()/seek() settle only once the backend
  // has actually reached the new state (a real handle is async; the fake fires
  // synchronously to keep the contract deterministic).
  #pendingSource: MediaSource | null = null;
  #openResolve: (() => void) | null = null;
  #seekResolve: (() => void) | null = null;
  #seekTargetMs = 0;

  constructor(surface: DesktopVideoSurface) {
    this.#surface = surface;
    this.#unbind = surface.bind({
      onFileLoaded: (e) => this.#onFileLoaded(e),
      onTimePos: (e) => this.#onTimePos(e),
      onSeekFinished: (e) => this.#onSeekFinished(e),
      onEndFile: (e) => this.#onEndFile(e.reason, e.error),
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
      this.#surface.commands.loadFile(source.uri);
    });
  }

  async play(): Promise<void> {
    if (this.#machine.state === 'playing') {
      return; // idempotent
    }
    const t = this.#dispatchOrThrow('play');
    this.#surface.commands.setPaused(false);
    this.#emit({ type: 'stateChanged', from: t.from, to: t.to });
  }

  async pause(): Promise<void> {
    if (this.#machine.state === 'paused') {
      return; // idempotent
    }
    const t = this.#dispatchOrThrow('pause');
    this.#surface.commands.setPaused(true);
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
      this.#surface.commands.seekAbsolute(toSec(target));
    });
  }

  setSpeed(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new ValidationError(`Playback rate must be > 0 (got ${rate})`);
    }
    this.#surface.commands.setSpeed(rate);
  }

  dispose(): void {
    this.#machine.dispatch('dispose');
    this.#unbind();
    this.#surface.commands.destroy();
    this.#listeners.clear();
    this.#durationMs = 0;
    this.#positionMs = 0;
  }

  // --- mpv callback handlers -------------------------------------------------

  #onFileLoaded(event: { readonly durationSec: number; readonly positionSec?: number }): void {
    if (this.#machine.state !== 'opening') {
      return; // stray load after dispose/retry
    }
    const source = this.#pendingSource;
    const nativeMs = event.durationSec > 0 ? toMs(event.durationSec) : 0;
    const durationMs = nativeMs > 0 ? nativeMs : source?.durationMs ?? 0;

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      // Bad media is an operational failure, not illegal API usage.
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
    this.#positionMs = toMs(event.positionSec ?? 0);

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

  #onTimePos(event: { readonly positionSec: number }): void {
    if (this.#machine.state !== 'playing') {
      return; // ignore ticks that are not from live playback
    }
    this.#positionMs = clamp(toMs(event.positionSec), 0, this.#durationMs);
    this.#emit({ type: 'positionChanged', positionMs: this.#positionMs });
  }

  #onSeekFinished(event: { readonly positionSec: number }): void {
    // While our own seek() is in flight, trust the clamped target we issued
    // (handles target 0 too); an unsolicited seek falls back to the report.
    const target =
      this.#seekResolve !== null
        ? this.#seekTargetMs
        : clamp(toMs(event.positionSec), 0, this.#durationMs);
    this.#positionMs = target;
    const t = this.#machine.dispatch('seek');
    if (t.ok && t.value.from !== t.value.to) {
      this.#emit({ type: 'stateChanged', from: t.value.from, to: t.value.to });
    }
    this.#emit({ type: 'seeked', positionMs: target });
    this.#resolveSeek();
  }

  /**
   * mpv collapses "reached the end" and "failed" into one `end-file` event; we
   * demultiplex on `reason`. This is the adapter-specific logic M3 exists to
   * exercise — RN delivered these as two separate callbacks.
   */
  #onEndFile(reason: EndFileReason, error?: string): void {
    if (reason === 'stop') {
      return; // deliberate stop (replace/destroy) — no lifecycle transition
    }
    if (reason === 'error') {
      this.#fail(error ?? 'playback error');
      return;
    }
    // reason === 'eof'
    if (this.#machine.state !== 'playing') {
      return;
    }
    this.#positionMs = this.#durationMs;
    this.#machine.dispatch('end');
    this.#emit({ type: 'positionChanged', positionMs: this.#durationMs });
    this.#emit({ type: 'stateChanged', from: 'playing', to: 'ended' });
    this.#emit({ type: 'ended' });
  }

  #fail(message: string): void {
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
