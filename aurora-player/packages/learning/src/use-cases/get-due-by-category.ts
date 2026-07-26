import type {
  ReviewCard,
  ReviewRepository,
  VocabularyRepository,
} from '@aurora/domain';
import { filterByCategory } from '../vocab-classify.js';
import { getDue } from './get-due.js';

export interface GetDueByCategoryDeps {
  readonly reviews: ReviewRepository;
  readonly vocab: VocabularyRepository;
}

/**
 * The review queue at `now`, narrowed to words filed under `category` (plan ·
 * 生词分类: study one bucket at a time). Pass `null` for the uncategorized words.
 *
 * A thin composition of the contract-tested {@link getDue} (queue + ordering)
 * and the pure {@link filterByCategory} (classification) — the scheduler and
 * `due` ordering are untouched, so this stays additive (OCP). Ordering follows
 * `getDue`; only non-matching cards are dropped.
 */
export const getDueByCategory = async (
  deps: GetDueByCategoryDeps,
  now: number,
  category: string | null,
): Promise<readonly ReviewCard[]> => {
  const due = await getDue(deps.reviews, now);
  const inCategory = new Set(
    filterByCategory(await deps.vocab.list(), category).map((e) => e.id),
  );
  return due.filter((card) => inCategory.has(card.vocabId));
};
