import { locateByStart } from './binary-search.js';
import type { JumpDirection, PositionState, TimedLine } from './model.js';

/**
 * Sentence-level cursor over a start-sorted sequence of timed lines.
 *
 * This is a semantic port of FlyleafLib `SubManager` — specifically
 * `SetCurrentTime` (binary-search location + `PositionState` classification),
 * `GetCurrent`, `GetNext` and `GetPrev`. Behaviour is preserved exactly so the
 * ported test fixture (SubManagerTests) passes unchanged; only optimisation and
 * naming differ from the C# original.
 */
export class SubtitleTimeline {
  readonly #lines: readonly TimedLine[];
  #currentIndex = -1;
  #state: PositionState = 'first';

  /**
   * @param lines Timed lines. Sorted by `startMs` defensively; the binary
   *   search requires ascending starts.
   */
  constructor(lines: readonly TimedLine[]) {
    this.#lines = [...lines].sort((a, b) => a.range.startMs - b.range.startMs);
  }

  get lines(): readonly TimedLine[] {
    return this.#lines;
  }

  get state(): PositionState {
    return this.#state;
  }

  /** -1 when positioned before the first line (`first` state). */
  get currentIndex(): number {
    return this.#currentIndex;
  }

  /**
   * Positions the cursor at `timeMs` (port of `SubManager.SetCurrentTime`).
   * Returns `this` for chaining.
   */
  seek(timeMs: number): this {
    if (this.#lines.length === 0) {
      return this;
    }

    // Fast path: if a line is showing and still strictly contains the time,
    // nothing changes (mirrors the C# early return, strict `<`/`>`).
    const cur = this.currentLine();
    if (cur && cur.range.startMs < timeMs && cur.range.endMs > timeMs) {
      return this;
    }

    const ret = locateByStart(this.#lines, timeMs);

    // Insertion point 0 → time precedes every line.
    if (~ret === 0) {
      this.#currentIndex = -1;
      this.#state = 'first';
      return this;
    }

    // `ret >= 0` is an exact start match; otherwise step back from the
    // insertion point to the line that started at-or-before `timeMs`.
    const idx = ret < 0 ? ~ret - 1 : ret;
    const line = this.#lines[idx]!;

    if (idx === this.#lines.length - 1) {
      // Final line: past its end means we've run off the tail.
      this.#currentIndex = idx;
      this.#state = line.range.endMs < timeMs ? 'last' : 'showing';
      return this;
    }

    // `idx` is the line that started at-or-before `timeMs`, so `startMs <=
    // timeMs` always holds here: on screen if we're also within its end,
    // otherwise sitting in the gap before the next line.
    this.#currentIndex = idx;
    this.#state = line.range.endMs >= timeMs ? 'showing' : 'around';
    return this;
  }

  /** The line on screen now, or `null` unless the state is `showing`. */
  currentLine(): TimedLine | null {
    if (this.#lines.length === 0 || this.#currentIndex === -1) {
      return null;
    }
    return this.#state === 'showing' ? this.#lines[this.#currentIndex]! : null;
  }

  /** The next line to seek forward to, or `null` at/after the tail. */
  nextLine(): TimedLine | null {
    if (this.#lines.length === 0) {
      return null;
    }
    switch (this.#state) {
      case 'first':
        return this.#lines[0]!;
      case 'showing':
      case 'around':
        return this.#currentIndex < this.#lines.length - 1
          ? this.#lines[this.#currentIndex + 1]!
          : null;
      case 'last':
        return null;
    }
  }

  /** The previous line to seek back to, or `null` at/before the head. */
  prevLine(): TimedLine | null {
    if (this.#lines.length === 0 || this.#currentIndex === -1) {
      return null;
    }
    switch (this.#state) {
      case 'showing':
        return this.#currentIndex > 0 ? this.#lines[this.#currentIndex - 1]! : null;
      case 'around':
        // In a gap: the "previous" sentence is the one we're sitting after.
        return this.#lines[this.#currentIndex]!;
      case 'last':
        return this.#lines[this.#lines.length - 1]!;
      case 'first':
        return null;
    }
  }

  /**
   * Sentence-level navigation: move the cursor onto the previous/next line and
   * seek to its start. Returns the line jumped to, or `null` if there is none
   * in that direction. This is how the player's "previous/next subtitle"
   * shortcuts are expressed on top of the ported cursor.
   */
  jumpSentence(direction: JumpDirection): TimedLine | null {
    const target = direction === 'next' ? this.nextLine() : this.prevLine();
    if (!target) {
      return null;
    }
    this.seek(target.range.startMs);
    return target;
  }
}
