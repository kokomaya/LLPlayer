import {
  NotFoundError,
  type Rating,
  type ReviewCard,
  type ReviewRepository,
} from '@aurora/domain';
import type { IReviewScheduler } from '../scheduler-port.js';

export interface GradeReviewDeps {
  readonly reviews: ReviewRepository;
  readonly scheduler: IReviewScheduler;
}

export interface GradeReviewInput {
  readonly id: string;
  readonly rating: Rating;
  readonly now: number;
}

/**
 * Grade a due card and persist its advanced schedule (plan/00 §4 journey step
 * "review"). Throws {@link NotFoundError} if the card does not exist.
 */
export const gradeReview = async (
  deps: GradeReviewDeps,
  input: GradeReviewInput,
): Promise<ReviewCard> => {
  const card = await deps.reviews.get(input.id);
  if (!card) {
    throw new NotFoundError(`No review card with id "${input.id}"`);
  }
  const next = deps.scheduler.grade(card, input.rating, input.now);
  await deps.reviews.upsert(next);
  return next;
};
