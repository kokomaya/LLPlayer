import type {
  NativeVideoCallbacks,
  NativeVideoCommands,
  NativeVideoSurface,
  UnbindCallbacks,
} from './native-video-surface.js';

export interface FakeNativeVideoSurfaceOptions {
  /** Duration the fake decoder reports at `onLoad`, in **seconds**. */
  readonly durationSec: number;
  /** When true, `load()` fires `onError` instead of `onLoad`. */
  readonly failOnLoad?: boolean;
}

/**
 * A deterministic, in-memory stand-in for a `react-native-video` handle. It
 * records the commands the adapter issues and lets a test drive native
 * callbacks by hand via {@link advance} — the exact seam a real device fills
 * with its decoder/frame loop. Because it is synchronous and clock-free, the
 * {@link ReactNativeVideoPlayer} it drives satisfies the same
 * `runPlayerContract` as `FakePlayer` without a device.
 *
 * `advance(deltaMs)` models wall-clock elapsing while playing: it moves native
 * position by `delta * rate` and fires `onProgress`, or `onEnd` once the end of
 * media is reached — mirroring how ExoPlayer/Media3 would report progress.
 */
export class FakeNativeVideoSurface implements NativeVideoSurface {
  #callbacks: NativeVideoCallbacks | null = null;
  #playing = false;
  #rate = 1;
  #positionMs = 0;
  readonly #durationMs: number;
  readonly #failOnLoad: boolean;

  /** Command log, exposed for assertions. */
  readonly issued: string[] = [];

  readonly commands: NativeVideoCommands;

  constructor(options: FakeNativeVideoSurfaceOptions) {
    this.#durationMs = Math.round(options.durationSec * 1000);
    this.#failOnLoad = options.failOnLoad ?? false;
    this.commands = {
      load: (uri) => {
        this.issued.push(`load:${uri}`);
        if (this.#failOnLoad) {
          this.#callbacks?.onError({ error: { errorString: 'load failed' } });
          return;
        }
        this.#positionMs = 0;
        this.#callbacks?.onLoad({ duration: this.#durationMs / 1000, currentTime: 0 });
      },
      play: () => {
        this.issued.push('play');
        this.#playing = true;
      },
      pause: () => {
        this.issued.push('pause');
        this.#playing = false;
      },
      seek: (positionSec) => {
        this.issued.push(`seek:${positionSec}`);
        this.#positionMs = Math.round(positionSec * 1000);
        this.#callbacks?.onSeek({ currentTime: positionSec, seekTime: positionSec });
      },
      setRate: (rate) => {
        this.issued.push(`setRate:${rate}`);
        this.#rate = rate;
      },
      release: () => {
        this.issued.push('release');
        this.#playing = false;
        this.#callbacks = null;
      },
    };
  }

  bind(callbacks: NativeVideoCallbacks): UnbindCallbacks {
    this.#callbacks = callbacks;
    return () => {
      if (this.#callbacks === callbacks) {
        this.#callbacks = null;
      }
    };
  }

  /** Simulate `deltaMs` of wall-clock elapsing (the driver seam). */
  advance(deltaMs: number): void {
    if (!this.#playing || !this.#callbacks) {
      return;
    }
    const next = this.#positionMs + deltaMs * this.#rate;
    if (next >= this.#durationMs) {
      this.#playing = false;
      this.#positionMs = this.#durationMs;
      this.#callbacks.onEnd();
      return;
    }
    this.#positionMs = next;
    this.#callbacks.onProgress({ currentTime: this.#positionMs / 1000 });
  }
}
