import type { EventBus, Unsubscribe } from '@aurora/domain';
import type { SubtitleLine } from '@aurora/subtitle';
import { SubtitleTimeline, WordCursor } from '@aurora/timeline';
import {
  buildSubtitleLineVMs,
  computeLineWindow,
  type LineWindow,
  type SubtitleDisplayMode,
  type SubtitleLineVM,
} from './subtitle-view.js';

// Presenter for the word-addressable subtitle surface shared by list (portrait,
// subx-style transcript below the video) and fullscreen (a fixed number of
// source lines) modes. Like SubtitleOverlayPresenter it is pure TS in a shared
// `scope:core` package: `apps/mobile` (React Native) and `apps/desktop` (Tauri)
// both render this ONE implementation and differ only in bindings — mobile maps
// tap→seek / long-press→menu, desktop maps click→seek / right-click(or hover)→
// menu, but the view-state, active tracking and windowing computed here are
// identical (OCP — a new platform reuses it without change). No player is
// touched: playback arrives only as `PositionChanged` on the EventBus.

/** The immutable snapshot the list / fullscreen subtitle view renders. */
export interface SubtitleListViewState {
  readonly mode: SubtitleDisplayMode;
  /** All source lines, word-addressable. Stable reference across ticks. */
  readonly lines: readonly SubtitleLineVM[];
  /** Index of the line under the playhead (for highlight / auto-scroll), or null. */
  readonly activeLineIndex: number | null;
  /** Index of the spoken word within the active line, or null. */
  readonly activeWordIndex: number | null;
  readonly positionMs: number;
  /** How many source lines fullscreen shows (ignored by list mode). */
  readonly lineCount: number;
  /** `[start, end)` slice to render: the window in fullscreen, all lines in list. */
  readonly visibleRange: LineWindow;
}

export type SubtitleListListener = (state: SubtitleListViewState) => void;

export interface SubtitleListOptions {
  readonly mode?: SubtitleDisplayMode;
  /** Source-line count for fullscreen mode (default 3). A wrapped line = one. */
  readonly lineCount?: number;
}

const DEFAULT_LINE_COUNT = 3;

/**
 * Presenter driving the list / fullscreen subtitle views. Builds the static
 * word-addressable model once, then on each `PositionChanged` recomputes which
 * line/word is active and (in fullscreen) which window of lines is visible.
 */
export class SubtitleListPresenter {
  readonly #lines: readonly SubtitleLineVM[];
  readonly #timeline: SubtitleTimeline;
  readonly #words: WordCursor;
  readonly #indexById: ReadonlyMap<string, number>;
  readonly #listeners = new Set<SubtitleListListener>();

  #mode: SubtitleDisplayMode;
  #lineCount: number;
  #positionMs = 0;
  #activeLineIndex: number | null = null;
  #activeWordIndex: number | null = null;
  #unsubscribe: Unsubscribe | null = null;

  constructor(lines: readonly SubtitleLine[], options: SubtitleListOptions = {}) {
    this.#lines = buildSubtitleLineVMs(lines);
    this.#timeline = new SubtitleTimeline(lines);
    this.#words = new WordCursor(lines);
    this.#indexById = new Map(this.#lines.map((l) => [l.id, l.lineIndex]));
    this.#mode = options.mode ?? 'list';
    this.#lineCount = Math.max(0, options.lineCount ?? DEFAULT_LINE_COUNT);
  }

  /** The static, word-addressable line model (stable reference). */
  get lines(): readonly SubtitleLineVM[] {
    return this.#lines;
  }

  /** The current view-state snapshot. */
  get state(): SubtitleListViewState {
    return {
      mode: this.#mode,
      lines: this.#lines,
      activeLineIndex: this.#activeLineIndex,
      activeWordIndex: this.#activeWordIndex,
      positionMs: this.#positionMs,
      lineCount: this.#lineCount,
      visibleRange: this.#window(),
    };
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
  onChange(listener: SubtitleListListener): Unsubscribe {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Switch layout mode (list ↔ fullscreen ↔ overlay). Emits immediately. */
  setMode(mode: SubtitleDisplayMode): void {
    if (mode !== this.#mode) {
      this.#mode = mode;
      this.#emit();
    }
  }

  /** Set how many source lines fullscreen shows (clamped ≥ 0). Emits immediately. */
  setLineCount(count: number): void {
    const next = Math.max(0, Math.floor(count));
    if (next !== this.#lineCount) {
      this.#lineCount = next;
      this.#emit();
    }
  }

  #window(): LineWindow {
    if (this.#mode === 'fullscreen') {
      return computeLineWindow(this.#activeLineIndex, this.#lines.length, this.#lineCount);
    }
    // list / overlay: the whole transcript is addressable; the view decides how
    // much to paint (list scrolls, overlay paints only the active line).
    return { start: 0, end: this.#lines.length };
  }

  #update(positionMs: number): void {
    this.#positionMs = positionMs;
    const line = this.#timeline.seek(positionMs).currentLine();
    this.#activeLineIndex = line ? this.#indexById.get(line.id) ?? null : null;

    const hit = this.#words.currentWord(positionMs);
    // Only treat the spoken word as active if it belongs to the active line, so
    // a stale word from an adjacent overlapping line never highlights.
    this.#activeWordIndex =
      hit !== null && line !== null && hit.line.id === line.id ? hit.wordIndex : null;

    this.#emit();
  }

  #emit(): void {
    const next = this.state;
    for (const listener of [...this.#listeners]) {
      listener(next);
    }
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#listeners.clear();
  }
}
