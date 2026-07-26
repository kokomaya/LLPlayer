import type {
  DesktopVideoCallbacks,
  DesktopVideoCommands,
  DesktopVideoSurface,
  UnbindDesktopCallbacks,
} from './desktop-video-surface.js';

export interface FakeDesktopVideoSurfaceOptions {
  /** Duration the fake mpv reports at `onFileLoaded`, in **seconds**. */
  readonly durationSec: number;
  /** When true, `loadFile()` fires `onEndFile('error')` instead of loading. */
  readonly failOnLoad?: boolean;
}

/**
 * A deterministic, in-memory stand-in for a libmpv handle. It records the
 * commands the adapter issues (mpv verbs) and lets a test drive mpv events by
 * hand via {@link advance} — the exact seam a real machine fills with mpv's
 * event loop. Because it is synchronous and clock-free, the {@link MpvPlayer} it
 * drives satisfies the same `runPlayerContract` as `FakePlayer` without a
 * desktop toolchain.
 *
 * `advance(deltaMs)` models wall-clock elapsing while unpaused: it moves the
 * `time-pos` by `delta * speed` and fires `onTimePos`, or `onEndFile('eof')`
 * once the end of file is reached — mirroring how libmpv reports progress.
 */
export class FakeDesktopVideoSurface implements DesktopVideoSurface {
  #callbacks: DesktopVideoCallbacks | null = null;
  #paused = true;
  #speed = 1;
  #positionMs = 0;
  readonly #durationMs: number;
  readonly #failOnLoad: boolean;

  /** Command log (mpv verbs), exposed for assertions. */
  readonly issued: string[] = [];

  readonly commands: DesktopVideoCommands;

  constructor(options: FakeDesktopVideoSurfaceOptions) {
    this.#durationMs = Math.round(options.durationSec * 1000);
    this.#failOnLoad = options.failOnLoad ?? false;
    this.commands = {
      loadFile: (uri) => {
        this.issued.push(`loadfile:${uri}`);
        if (this.#failOnLoad) {
          this.#callbacks?.onEndFile({ reason: 'error', error: 'load failed' });
          return;
        }
        this.#positionMs = 0;
        this.#callbacks?.onFileLoaded({
          durationSec: this.#durationMs / 1000,
          positionSec: 0,
        });
      },
      setPaused: (paused) => {
        this.issued.push(`pause:${paused}`);
        this.#paused = paused;
      },
      seekAbsolute: (positionSec) => {
        this.issued.push(`seek:${positionSec}`);
        this.#positionMs = Math.round(positionSec * 1000);
        this.#callbacks?.onSeekFinished({ positionSec });
      },
      setSpeed: (rate) => {
        this.issued.push(`speed:${rate}`);
        this.#speed = rate;
      },
      destroy: () => {
        this.issued.push('destroy');
        this.#paused = true;
        this.#callbacks = null;
      },
    };
  }

  bind(callbacks: DesktopVideoCallbacks): UnbindDesktopCallbacks {
    this.#callbacks = callbacks;
    return () => {
      if (this.#callbacks === callbacks) {
        this.#callbacks = null;
      }
    };
  }

  /** Emit a raw `end-file` with the given reason (driver seam for tests). */
  emitEndFile(reason: 'eof' | 'error' | 'stop', error?: string): void {
    this.#paused = true;
    this.#callbacks?.onEndFile(error === undefined ? { reason } : { reason, error });
  }

  /** Simulate `deltaMs` of wall-clock elapsing (the driver seam). */
  advance(deltaMs: number): void {
    if (this.#paused || !this.#callbacks) {
      return;
    }
    const next = this.#positionMs + deltaMs * this.#speed;
    if (next >= this.#durationMs) {
      this.#paused = true;
      this.#positionMs = this.#durationMs;
      this.#callbacks.onEndFile({ reason: 'eof' });
      return;
    }
    this.#positionMs = next;
    this.#callbacks.onTimePos({ positionSec: this.#positionMs / 1000 });
  }
}
