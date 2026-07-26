import type { LanguageCode } from '../value-objects/language-code.js';
import type { Lemma } from '../value-objects/lemma.js';
import type { ReviewState, VocabStatus } from './rating.js';

/**
 * A word the learner has saved for study (plan/05 · learning). Pure data: the
 * normalized {@link Lemma} plus the language it was captured in, the optional
 * surface context it was seen in, and a coarse mastery {@link VocabStatus}.
 *
 * Times are epoch milliseconds (`number`) — the same unit the injected clock
 * yields — so records serialize verbatim to any repository backend and stay
 * deterministic under a `ManualClock`.
 */
export interface VocabEntry {
  readonly id: string;
  readonly lemma: Lemma;
  readonly lang: LanguageCode;
  /** Sentence/line the word was captured from, if any. */
  readonly context?: string;
  readonly status: VocabStatus;
  readonly createdAt: number;
  /**
   * Free-form labels the learner attaches for grouping (e.g. a deck name, a
   * topic, a source). Optional and additive (plan · OCP): a missing/empty list
   * means "untagged" — never a breaking default. Order is preserved as given;
   * callers that need set semantics should normalize before persisting.
   */
  readonly tags?: readonly string[];
  /**
   * A single coarse bucket the learner files this word under (e.g. "phrasal
   * verbs", "N2"). Distinct from {@link tags}: one word has at most one
   * `category` but any number of `tags`. Optional/additive; absent = uncategorized.
   */
  readonly category?: string;
}

/**
 * The spaced-repetition scheduling state for one {@link VocabEntry}. Field
 * names/units mirror the FSRS card model so an FSRS implementation maps onto it
 * one-to-one, but the type itself carries no algorithm — it is a plain record a
 * {@link ReviewRepository} can persist and any `IReviewScheduler` can advance.
 */
export interface ReviewCard {
  readonly id: string;
  readonly vocabId: string;
  /** When this card next becomes due, in epoch milliseconds. */
  readonly due: number;
  readonly stability: number;
  readonly difficulty: number;
  readonly elapsedDays: number;
  readonly scheduledDays: number;
  /** FSRS short-term learning-step counter; other schedulers may leave it 0. */
  readonly learningSteps: number;
  readonly reps: number;
  readonly lapses: number;
  readonly state: ReviewState;
  /** Epoch milliseconds of the last grading, or undefined if never reviewed. */
  readonly lastReviewedAt?: number;
}
