// learning-core: a scheduler port + FSRS implementation and the vocabulary /
// review use-cases. Repositories are consumed through the kernel ports
// (@aurora/domain); concrete stores live in @aurora/storage. Pure TS — no
// platform, driven by an injected clock (plan/05 · learning, plan/07 · M3).

export type { IReviewScheduler } from './scheduler-port.js';
export { FsrsScheduler } from './schedulers/fsrs-scheduler.js';

export { vocabId } from './use-cases/ids.js';
export {
  addVocabulary,
  type AddVocabularyDeps,
  type AddVocabularyInput,
  type AddVocabularyResult,
} from './use-cases/add-vocabulary.js';
export {
  gradeReview,
  type GradeReviewDeps,
  type GradeReviewInput,
} from './use-cases/grade-review.js';
export { getDue } from './use-cases/get-due.js';
export {
  getDueByCategory,
  type GetDueByCategoryDeps,
} from './use-cases/get-due-by-category.js';
export {
  UNCATEGORIZED,
  filterByCategory,
  filterByTag,
  groupByCategory,
  countByCategory,
  countByTag,
  distinctCategories,
  distinctTags,
} from './vocab-classify.js';
