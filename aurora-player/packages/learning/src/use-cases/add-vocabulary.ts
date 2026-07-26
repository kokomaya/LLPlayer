import type {
  LanguageCode,
  Lemma,
  ReviewCard,
  ReviewRepository,
  VocabEntry,
  VocabularyRepository,
} from '@aurora/domain';
import type { IReviewScheduler } from '../scheduler-port.js';
import { vocabId } from './ids.js';

export interface AddVocabularyDeps {
  readonly vocab: VocabularyRepository;
  readonly reviews: ReviewRepository;
  readonly scheduler: IReviewScheduler;
}

export interface AddVocabularyInput {
  readonly lemma: Lemma;
  readonly lang: LanguageCode;
  readonly now: number;
  readonly context?: string;
  /** Optional grouping labels to file the new word under (plan · 生词分类). */
  readonly tags?: readonly string[];
  /** Optional single bucket to file the new word under. */
  readonly category?: string;
}

export interface AddVocabularyResult {
  readonly entry: VocabEntry;
  readonly card: ReviewCard;
  /** `false` when the word was already saved (the call is idempotent). */
  readonly created: boolean;
}

/**
 * Save a word for study and seed its initial review card (plan/00 §4 journey
 * step "add"). Idempotent: re-adding an existing (lang, lemma) returns the
 * stored entry/card unchanged rather than resetting the schedule.
 */
export const addVocabulary = async (
  deps: AddVocabularyDeps,
  input: AddVocabularyInput,
): Promise<AddVocabularyResult> => {
  const id = vocabId(input.lang, input.lemma);
  const existing = await deps.vocab.get(id);
  if (existing) {
    const card = await deps.reviews.get(id);
    return { entry: existing, card: card ?? deps.scheduler.initialCard(id, id, input.now), created: false };
  }

  const entry: VocabEntry = {
    id,
    lemma: input.lemma,
    lang: input.lang,
    status: 'learning',
    createdAt: input.now,
    ...(input.context !== undefined ? { context: input.context } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  };
  const card = deps.scheduler.initialCard(id, id, input.now);
  await deps.vocab.upsert(entry);
  await deps.reviews.upsert(card);
  return { entry, card, created: true };
};
