// Word-level seek targets — the headless half of "按词快进快退" (jump playback by
// word). Given the current playback position and the timed lines, compute where
// the player should seek for a prev/next-word step. Pure and stateless: the UI
// binding feeds `positionMs`, gets a target back, and calls `player.seek`.
//
// Reuses {@link WordCursor}, so it inherits the same graceful degradation — when
// a line has no real word timings the step still lands on char-length
// interpolated words, flagged `estimated: true` (plan/05).

import type { JumpDirection, TimedLine, WordHit } from './model.js';
import { WordCursor } from './word-cursor.js';

/** A resolved word-step: where to seek and which word was landed on. */
export interface WordStep {
  /** Absolute seek target in ms — the start of {@link word}. */
  readonly targetMs: number;
  /** The word the step lands on. */
  readonly word: WordHit;
  /** True when {@link word}'s timing was interpolated, not real. */
  readonly estimated: boolean;
}

// `words` is start-sorted by WordCursor. "next" = first word starting strictly
// after the position; "prev" = last word starting strictly before it. Strict
// comparisons make a prev-step from mid-word land on the current word's start
// (re-hear it) and a second prev-step move to the word before — the natural
// language-study cadence — while next-step always advances.
const pick = (
  words: readonly WordHit[],
  positionMs: number,
  direction: JumpDirection,
): WordHit | null => {
  if (direction === 'next') {
    return words.find((w) => w.range.startMs > positionMs) ?? null;
  }
  let found: WordHit | null = null;
  for (const w of words) {
    if (w.range.startMs >= positionMs) {
      break;
    }
    found = w;
  }
  return found;
};

/**
 * Seek target for one word-step from `positionMs` in `direction` over `lines`,
 * or `null` when there is no such word (already at/before the first word for
 * `prev`, at/after the last for `next`, or no words at all).
 */
export const wordSeek = (
  lines: readonly TimedLine[],
  positionMs: number,
  direction: JumpDirection,
): WordStep | null => {
  const hit = pick(new WordCursor(lines).words, positionMs, direction);
  return hit === null
    ? null
    : { targetMs: hit.range.startMs, word: hit, estimated: hit.estimated };
};

/** Seek target for the next word after `positionMs`. See {@link wordSeek}. */
export const nextWordSeekMs = (
  lines: readonly TimedLine[],
  positionMs: number,
): WordStep | null => wordSeek(lines, positionMs, 'next');

/** Seek target for the previous word before `positionMs`. See {@link wordSeek}. */
export const prevWordSeekMs = (
  lines: readonly TimedLine[],
  positionMs: number,
): WordStep | null => wordSeek(lines, positionMs, 'prev');
