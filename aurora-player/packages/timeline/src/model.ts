import type { TimeRange } from '@aurora/domain';

/**
 * Minimal structural shape the timeline cursor operates on. A
 * `@aurora/subtitle` `SubtitleLine` is assignable to this, so the composition
 * root can feed `document.lines` straight in — but timeline never *imports*
 * subtitle (both are `layer:domain`; domain packages may depend only on the
 * kernel — plan/03 §3). This keeps the cursor reusable for any timed sequence.
 */
export interface TimedLine {
  readonly id: string;
  readonly range: TimeRange;
  readonly text: string;
  /**
   * Optional word-level timings. A `@aurora/subtitle` `Word` is assignable to
   * {@link TimedWord} (it carries an extra `lemma?`, which is allowed
   * structurally), so `document.lines` still flows straight into the cursor.
   * When absent — or present without ranges — the {@link WordCursor} degrades to
   * char-length interpolation and marks results estimated.
   */
  readonly words?: readonly TimedWord[];
}

/**
 * Structural shape of a single word within a {@link TimedLine}. `range` is
 * optional: aligners (e.g. WhisperX) often leave punctuation untimed, and
 * sentence-level formats carry no word timings at all.
 */
export interface TimedWord {
  readonly text: string;
  readonly range?: TimeRange;
}

/** Direction for {@link WordCursor.jumpWord} / `SubtitleTimeline.jumpSentence`. */
export type JumpDirection = 'next' | 'prev';

/**
 * A located word plus enough context to render it and to know how trustworthy
 * its timing is. `estimated` is `true` whenever the range was derived by
 * char-length interpolation rather than read from the source.
 */
export interface WordHit {
  /** The line the word belongs to. */
  readonly line: TimedLine;
  /** Index of the word within its line. */
  readonly wordIndex: number;
  readonly text: string;
  /** Resolved timing — actual when available, interpolated otherwise. */
  readonly range: TimeRange;
  readonly estimated: boolean;
}

/**
 * Cursor position relative to the line sequence — a faithful port of
 * FlyleafLib `SubManager.PositionState`.
 *
 * - `first`   — playback has not yet reached the first line.
 * - `showing` — a line is currently on screen.
 * - `around`  — between two lines (nothing on screen), able to seek either way.
 * - `last`    — playback is past the final line.
 */
export type PositionState = 'first' | 'showing' | 'around' | 'last';
