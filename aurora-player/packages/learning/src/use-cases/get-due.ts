import type { ReviewCard, ReviewRepository } from '@aurora/domain';

/**
 * The review queue at `now`: cards whose `due <= now`, ascending by `due`
 * (plan/07 · M3 DoD "getDue"). Delegates to the repository's contract-tested
 * {@link ReviewRepository.listDue} so ordering has a single source of truth.
 */
export const getDue = (
  reviews: ReviewRepository,
  now: number,
): Promise<readonly ReviewCard[]> => reviews.listDue(now);
