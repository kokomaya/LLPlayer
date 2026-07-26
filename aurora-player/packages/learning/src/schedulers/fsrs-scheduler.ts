import type { Rating, ReviewCard, ReviewState } from '@aurora/domain';
import {
  type Card,
  type FSRS,
  type FSRSParameters,
  type Grade,
  Rating as FsrsRating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from 'ts-fsrs';
import type { IReviewScheduler } from '../scheduler-port.js';

const STATE_FROM_FSRS: Readonly<Record<State, ReviewState>> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const STATE_TO_FSRS: Readonly<Record<ReviewState, State>> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const RATING_TO_FSRS: Readonly<Record<Rating, Grade>> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

/** Our kernel card → the ts-fsrs card shape (times as `Date`). */
const toFsrsCard = (card: ReviewCard): Card => ({
  due: new Date(card.due),
  stability: card.stability,
  difficulty: card.difficulty,
  elapsed_days: card.elapsedDays,
  scheduled_days: card.scheduledDays,
  learning_steps: card.learningSteps,
  reps: card.reps,
  lapses: card.lapses,
  state: STATE_TO_FSRS[card.state],
  ...(card.lastReviewedAt !== undefined
    ? { last_review: new Date(card.lastReviewedAt) }
    : {}),
});

/** ts-fsrs card → our kernel card (times back to epoch ms), ids re-attached. */
const fromFsrsCard = (c: Card, id: string, vocabId: string): ReviewCard => ({
  id,
  vocabId,
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: c.elapsed_days,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: STATE_FROM_FSRS[c.state],
  ...(c.last_review !== undefined ? { lastReviewedAt: c.last_review.getTime() } : {}),
});

/**
 * {@link IReviewScheduler} backed by the FSRS algorithm via the pure-TS
 * `ts-fsrs` library (plan/07 · M3). ts-fsrs is an ordinary external dependency
 * (no native/platform code), so it is allowed inside the core behind this port.
 *
 * Fuzz is disabled so scheduling is fully deterministic given an injected `now`
 * — required for reproducible `getDue` results and CI (plan/09).
 */
export class FsrsScheduler implements IReviewScheduler {
  readonly #fsrs: FSRS;

  constructor(overrides: Partial<FSRSParameters> = {}) {
    this.#fsrs = fsrs(generatorParameters({ enable_fuzz: false, ...overrides }));
  }

  initialCard(id: string, vocabId: string, now: number): ReviewCard {
    return fromFsrsCard(createEmptyCard(new Date(now)), id, vocabId);
  }

  grade(card: ReviewCard, rating: Rating, now: number): ReviewCard {
    const { card: next } = this.#fsrs.next(
      toFsrsCard(card),
      new Date(now),
      RATING_TO_FSRS[rating],
    );
    return fromFsrsCard(next, card.id, card.vocabId);
  }
}
