import type { EventBus, Unsubscribe } from '@aurora/domain';
import { flattenText } from '@aurora/subtitle';
import { SubtitleTimeline, WordCursor, type TimedLine } from '@aurora/timeline';

/**
 * The immutable snapshot a subtitle overlay renders: the active sentence and the
 * word currently spoken, plus whether the word timing was estimated (so the UI
 * can render interpolated words differently — e.g. no per-word highlight).
 */
export interface OverlayViewState {
  readonly positionMs: number;
  readonly lineId: string | null;
  readonly line: string | null;
  readonly word: string | null;
  readonly wordIndex: number | null;
  /** True when the word's timing was interpolated, not read from the source. */
  readonly estimated: boolean;
}

export type OverlayListener = (state: OverlayViewState) => void;

const EMPTY: OverlayViewState = {
  positionMs: 0,
  lineId: null,
  line: null,
  word: null,
  wordIndex: null,
  estimated: false,
};

/**
 * Pure-TS presenter (plan/04 · "thin bindings, thick testables"). It listens to
 * the domain {@link EventBus} for `PositionChanged` and derives the overlay
 * view-state from a {@link SubtitleTimeline} (sentence) and {@link WordCursor}
 * (word). It contains **no** platform library (React / React Native / Tauri) —
 * the overlay component only reads its {@link state} and subscribes via {@link
 * onChange}, so every sync decision is unit-tested in Node against `FakePlayer`.
 *
 * It never touches the player directly: playback reaches it only as events, so
 * the same presenter works behind any {@link IPlayer} adapter — which is exactly
 * why it lives here in a shared `scope:core` package rather than inside a single
 * app: `apps/mobile` and `apps/desktop` both consume this one implementation
 * (OCP — a new app reuses it without change).
 */
export class SubtitleOverlayPresenter {
  readonly #timeline: SubtitleTimeline;
  readonly #words: WordCursor;
  readonly #listeners = new Set<OverlayListener>();
  #state: OverlayViewState = EMPTY;
  #unsubscribe: Unsubscribe | null = null;

  constructor(lines: readonly TimedLine[]) {
    this.#timeline = new SubtitleTimeline(lines);
    this.#words = new WordCursor(lines);
  }

  /** The most recently computed view-state. */
  get state(): OverlayViewState {
    return this.#state;
  }

  /** Subscribe to `PositionChanged` on `bus`. Idempotent — rebinds cleanly. */
  connect(bus: EventBus): this {
    this.#unsubscribe?.();
    this.#unsubscribe = bus.subscribe('PositionChanged', (event) => {
      this.#update(event.payload.positionMs);
    });
    return this;
  }

  /** Register a view listener; returns an unsubscribe handle. */
  onChange(listener: OverlayListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #update(positionMs: number): void {
    const line = this.#timeline.seek(positionMs).currentLine();
    const hit = this.#words.currentWord(positionMs);
    this.#state = {
      positionMs,
      lineId: line ? line.id : null,
      line: line ? flattenText(line.text) : null,
      word: hit ? hit.text : null,
      wordIndex: hit ? hit.wordIndex : null,
      estimated: hit ? hit.estimated : false,
    };
    for (const listener of [...this.#listeners]) {
      listener(this.#state);
    }
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#listeners.clear();
  }
}
