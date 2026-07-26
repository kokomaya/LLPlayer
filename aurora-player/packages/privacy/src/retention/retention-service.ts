import type { ReviewRepository, VocabularyRepository } from '@aurora/domain';
import { isExpired, type RetentionPolicy, type RetentionReport } from './policy.js';

/**
 * The kernel repository ports a retention pass coordinates. Deliberately only
 * `vocab` + `reviews` — retention is storage limitation for the user's own
 * *learning* data. Consent is NOT here: it is the legal-basis record, governed by
 * DSAR erase, never by a retention timer (rule ①.E). A superset object (e.g.
 * {@link DataSubjectRepositories}) is structurally assignable, so the composition
 * root can reuse its wiring.
 */
export interface RetentionRepositories {
  readonly vocab: VocabularyRepository;
  readonly reviews: ReviewRepository;
}

export interface PruneOptions {
  /** When true, compute the report but delete nothing (preview). */
  readonly dryRun?: boolean;
}

/**
 * Enforces storage limitation (plan/12) by pruning learning data past a retention
 * window. Pure coordination over kernel ports — reuses `list()` + `delete(id)`
 * that already exist, so no port changes. The clock is the caller's `now`, never
 * `Date.now()` (rule ①.C.13), so a pass is deterministic and testable.
 *
 * `ReviewCard` has no `createdAt` of its own — a card is scheduling state that
 * only exists for a word. So the pass keys expiry off `VocabEntry.createdAt` and
 * cascades: when a word is pruned, its review card is removed with it as an
 * orphan (referential integrity). A card whose word survives is untouched.
 */
export class RetentionService {
  readonly #repos: RetentionRepositories;

  constructor(repos: RetentionRepositories) {
    this.#repos = repos;
  }

  async prune(
    now: number,
    policy: RetentionPolicy,
    options: PruneOptions = {},
  ): Promise<RetentionReport> {
    const cutoff = now - policy.maxAgeMs;
    const [vocab, reviews] = await Promise.all([
      this.#repos.vocab.list(),
      this.#repos.reviews.list(),
    ]);

    const expiredVocab = vocab.filter((v) => isExpired(v.createdAt, cutoff));
    const expiredIds = new Set(expiredVocab.map((v) => v.id));
    const orphanReviews = reviews.filter((r) => expiredIds.has(r.vocabId));

    const dryRun = options.dryRun ?? false;
    if (!dryRun) {
      await Promise.all([
        ...expiredVocab.map((v) => this.#repos.vocab.delete(v.id)),
        ...orphanReviews.map((r) => this.#repos.reviews.delete(r.id)),
      ]);
    }

    return {
      cutoff,
      deletedVocab: expiredVocab.map((v) => v.id),
      deletedReviews: orphanReviews.map((r) => r.id),
      retainedVocab: vocab.length - expiredVocab.length,
      dryRun,
    };
  }
}
