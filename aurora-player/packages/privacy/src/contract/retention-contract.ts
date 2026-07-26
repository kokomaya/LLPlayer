import type {
  LanguageCode,
  Lemma,
  ReviewCard,
  VocabEntry,
} from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RetentionService,
  type RetentionRepositories,
} from '../retention/retention-service.js';

/**
 * Reusable behaviour spec for storage limitation (plan/09 §1 · contract tests;
 * plan/12 · legal-privacy: data retention). Any set of repositories — the
 * kernel-only fakes in `retention.test.ts`, the real in-memory and SQLite
 * adapters at the composition root — yields the same prune behaviour when driven
 * through {@link RetentionService}, so automatic expiry is a substitutable,
 * verifiable capability (LSP).
 *
 * The case supplies a `makeRepos` factory (and optional `dispose`) so the suite
 * stays kernel-only: `@aurora/privacy` may not import `@aurora/storage` (both are
 * `layer:domain`, rule ①.A.2); the real adapters run from a `scope:tool` consumer
 * that may depend on both.
 */
export interface RetentionContractCase {
  readonly name: string;
  readonly makeRepos: () => RetentionRepositories;
  readonly dispose?: (repos: RetentionRepositories) => void;
}

// Fixed injected clock — a prune pass carries no wall clock (rule ①.C.13).
const AT = 1_700_000_000_000;
const DAY = 86_400_000;

const vocab = (over: Partial<VocabEntry> = {}): VocabEntry => ({
  id: 'en:hello',
  lemma: 'hello' as Lemma,
  lang: 'en' as LanguageCode,
  status: 'learning',
  createdAt: AT,
  ...over,
});

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  id: 'en:hello',
  vocabId: 'en:hello',
  due: AT,
  stability: 1,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 'new',
  ...over,
});

export const runRetentionContract = (testCase: RetentionContractCase): void => {
  describe(`RetentionService contract: ${testCase.name}`, () => {
    let repos: RetentionRepositories;
    let service: RetentionService;

    beforeEach(() => {
      repos = testCase.makeRepos();
      service = new RetentionService(repos);
    });

    afterEach(() => {
      testCase.dispose?.(repos);
    });

    it('reports nothing on an empty store', async () => {
      const report = await service.prune(AT, { maxAgeMs: 30 * DAY });
      expect(report).toEqual({
        cutoff: AT - 30 * DAY,
        deletedVocab: [],
        deletedReviews: [],
        retainedVocab: 0,
        dryRun: false,
      });
    });

    it('prunes vocab past the window and keeps fresh vocab', async () => {
      await repos.vocab.upsert(vocab({ id: 'old', createdAt: AT - 40 * DAY }));
      await repos.vocab.upsert(vocab({ id: 'new', createdAt: AT - 10 * DAY }));

      const report = await service.prune(AT, { maxAgeMs: 30 * DAY });

      expect(report.deletedVocab).toEqual(['old']);
      expect(report.retainedVocab).toBe(1);
      expect((await repos.vocab.list()).map((v) => v.id)).toEqual(['new']);
    });

    it('cascades: a pruned word takes its card; a kept word keeps its card', async () => {
      await repos.vocab.upsert(vocab({ id: 'old', createdAt: AT - 40 * DAY }));
      await repos.vocab.upsert(vocab({ id: 'new', createdAt: AT - 1 * DAY }));
      await repos.reviews.upsert(card({ id: 'c-old', vocabId: 'old' }));
      await repos.reviews.upsert(card({ id: 'c-new', vocabId: 'new' }));

      const report = await service.prune(AT, { maxAgeMs: 30 * DAY });

      expect(report.deletedReviews).toEqual(['c-old']);
      expect((await repos.reviews.list()).map((c) => c.id)).toEqual(['c-new']);
    });

    it('treats the cutoff as inclusive (created exactly maxAgeMs ago expires)', async () => {
      await repos.vocab.upsert(vocab({ id: 'edge', createdAt: AT - 30 * DAY }));
      const report = await service.prune(AT, { maxAgeMs: 30 * DAY });
      expect(report.deletedVocab).toEqual(['edge']);
    });

    it('dry-run reports would-delete but removes nothing', async () => {
      await repos.vocab.upsert(vocab({ id: 'old', createdAt: AT - 40 * DAY }));
      await repos.reviews.upsert(card({ id: 'c-old', vocabId: 'old' }));

      const report = await service.prune(
        AT,
        { maxAgeMs: 30 * DAY },
        { dryRun: true },
      );

      expect(report.dryRun).toBe(true);
      expect(report.deletedVocab).toEqual(['old']);
      expect(report.deletedReviews).toEqual(['c-old']);
      expect((await repos.vocab.list()).map((v) => v.id)).toEqual(['old']);
      expect((await repos.reviews.list()).map((c) => c.id)).toEqual(['c-old']);
    });
  });
};
