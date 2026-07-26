import type { TimeRange } from '@aurora/domain';
import type { JumpDirection, TimedLine, TimedWord, WordHit } from './model.js';

interface ResolvedWord {
  readonly text: string;
  readonly range: TimeRange;
  readonly estimated: boolean;
}

/** Split a sentence into display words (collapsing runs of whitespace). */
const splitText = (text: string): string[] =>
  text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

/**
 * Distribute a line's [startMs, endMs] across its words in proportion to each
 * word's character length (a cheap, monotonic estimate). Used whenever real
 * word timings are missing; every result is flagged `estimated`.
 */
const interpolate = (texts: readonly string[], range: TimeRange): ResolvedWord[] => {
  const span = Math.max(0, range.endMs - range.startMs);
  const hasChars = texts.some((t) => t.length > 0);
  const weights = texts.map((t) => (hasChars ? t.length : 1));
  const total = weights.reduce((n, w) => n + w, 0);

  const out: ResolvedWord[] = [];
  let acc = 0;
  texts.forEach((text, i) => {
    const startMs = range.startMs + Math.round((span * acc) / total);
    acc += weights[i]!;
    const endMs =
      i === texts.length - 1
        ? range.endMs
        : range.startMs + Math.round((span * acc) / total);
    out.push({ text, range: { startMs, endMs: Math.max(startMs, endMs) }, estimated: true });
  });
  return out;
};

/**
 * Resolve one line into concrete, timed words. Real word ranges are used when
 * every word carries one; otherwise the whole line degrades to char-length
 * interpolation (falling back to a whitespace split of the line text when no
 * word list is supplied at all).
 */
const resolveWords = (line: TimedLine): ResolvedWord[] => {
  const supplied: readonly TimedWord[] =
    line.words && line.words.length > 0
      ? line.words.filter((w) => w.text.trim().length > 0)
      : splitText(line.text).map((text) => ({ text }));

  if (supplied.length === 0) {
    return [];
  }

  const allTimed = supplied.every((w) => w.range !== undefined);
  if (allTimed) {
    return supplied.map((w) => ({
      text: w.text,
      range: w.range!,
      estimated: false,
    }));
  }
  return interpolate(
    supplied.map((w) => w.text),
    line.range,
  );
};

/**
 * Word-level cursor over a start-sorted sequence of {@link TimedLine}s.
 *
 * Purely structural — like {@link SubtitleTimeline} it never imports
 * `@aurora/subtitle`; a `SubtitleDocument`'s `lines` are assignable directly.
 * Queries ({@link currentWord}, {@link nearestWord}) are pure; navigation
 * ({@link seek}, {@link jumpWord}) moves an internal cursor. Any word whose
 * timing was interpolated is returned with `estimated: true` (plan/05 —
 * graceful degradation when `hasWordTimings` is false).
 */
export class WordCursor {
  readonly #lines: readonly TimedLine[];
  readonly #words: readonly WordHit[];
  #index = -1;

  constructor(lines: readonly TimedLine[]) {
    this.#lines = [...lines].sort((a, b) => a.range.startMs - b.range.startMs);
    const flat: WordHit[] = [];
    for (const line of this.#lines) {
      resolveWords(line).forEach((w, wordIndex) => {
        flat.push({
          line,
          wordIndex,
          text: w.text,
          range: w.range,
          estimated: w.estimated,
        });
      });
    }
    // Keep the flat list start-sorted so lookups can binary-search.
    flat.sort((a, b) => a.range.startMs - b.range.startMs);
    this.#words = flat;
  }

  /** All resolved words, flattened and start-sorted. */
  get words(): readonly WordHit[] {
    return this.#words;
  }

  /** -1 until {@link seek}/{@link jumpWord} has positioned the cursor. */
  get currentIndex(): number {
    return this.#index;
  }

  /** The word at the internal cursor, or `null` if unset. */
  current(): WordHit | null {
    return this.#index < 0 ? null : (this.#words[this.#index] ?? null);
  }

  /**
   * The word whose (resolved) range contains `timeMs`, or `null` when the time
   * falls in a gap or outside every word. Pure — does not move the cursor.
   */
  currentWord(timeMs: number): WordHit | null {
    const i = this.#locate(timeMs);
    if (i < 0) {
      return null;
    }
    const word = this.#words[i]!;
    return word.range.endMs >= timeMs ? word : null;
  }

  /**
   * The word closest to `timeMs` — the containing word if there is one, else the
   * nearer of the words bracketing the gap. `null` only when there are no words.
   * Pure — does not move the cursor.
   */
  nearestWord(timeMs: number): WordHit | null {
    if (this.#words.length === 0) {
      return null;
    }
    const i = this.#locate(timeMs);
    if (i < 0) {
      return this.#words[0]!; // before the first word
    }
    const before = this.#words[i]!;
    if (before.range.endMs >= timeMs) {
      return before; // inside a word
    }
    const after = this.#words[i + 1];
    if (!after) {
      return before; // past the last word
    }
    const distBefore = timeMs - before.range.endMs;
    const distAfter = after.range.startMs - timeMs;
    return distAfter < distBefore ? after : before;
  }

  /** Position the cursor on the word nearest `timeMs`. Returns `this`. */
  seek(timeMs: number): this {
    const hit = this.nearestWord(timeMs);
    this.#index = hit ? this.#words.indexOf(hit) : -1;
    return this;
  }

  /**
   * Move the cursor one word in `direction` and return the word landed on, or
   * `null` when there is none (the cursor then stays put). From an unset cursor,
   * `next` starts at the first word and `prev` yields `null`.
   */
  jumpWord(direction: JumpDirection): WordHit | null {
    if (this.#words.length === 0) {
      return null;
    }
    const target =
      this.#index < 0
        ? direction === 'next'
          ? 0
          : -1
        : this.#index + (direction === 'next' ? 1 : -1);
    if (target < 0 || target >= this.#words.length) {
      return null;
    }
    this.#index = target;
    return this.#words[target]!;
  }

  /** Index of the last word whose `startMs <= timeMs`, or -1. */
  #locate(timeMs: number): number {
    let lo = 0;
    let hi = this.#words.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (this.#words[mid]!.range.startMs <= timeMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }
}
