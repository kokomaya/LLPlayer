import type { Rating, ReviewCard } from '@aurora/domain';

/**
 * Spaced-repetition scheduling port (plan/05 · learning). The concrete
 * algorithm (FSRS, SM-2, …) hides behind this seam so use-cases and the CLI
 * depend on the abstraction, never on the library (DIP). Every method takes the
 * current time as an injected epoch-millisecond `now` — the core never reads the
 * wall clock (`Date.now()` is banned; plan/09 · deterministic time).
 */
export interface IReviewScheduler {
  /** A fresh, never-reviewed card for `vocabId`, due immediately at `now`. */
  initialCard(id: string, vocabId: string, now: number): ReviewCard;
  /** Advance `card`'s schedule given how well it was recalled at `now`. */
  grade(card: ReviewCard, rating: Rating, now: number): ReviewCard;
}
