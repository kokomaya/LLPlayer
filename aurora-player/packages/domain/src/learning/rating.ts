/**
 * Learning-loop rating & state vocabulary (plan/05 · learning, plan/07 · M3).
 *
 * These are pure data unions in the shared kernel so BOTH the `learning`
 * (scheduling/use-cases) and `storage` (repositories) domain packages can depend
 * on them while depending only on the kernel — never on each other (the
 * domain→domain ban, plan/03 §3). No behaviour, no platform, no external libs.
 */

/** How well a card was recalled during review. Aligns with the FSRS grades. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

/** All ratings, worst→best; the canonical ordering used by schedulers. */
export const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

export const isRating = (value: string): value is Rating =>
  (RATINGS as readonly string[]).includes(value);

/** Scheduling lifecycle of a review card. Mirrors the FSRS state machine. */
export type ReviewState = 'new' | 'learning' | 'review' | 'relearning';

/** A learner's mastery of a vocabulary item, independent of the schedule. */
export type VocabStatus = 'unknown' | 'learning' | 'known';
