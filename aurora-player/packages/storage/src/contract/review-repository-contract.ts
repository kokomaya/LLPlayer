import type { ReviewCard, ReviewRepository } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for {@link ReviewRepository} implementations. The key
 * cross-adapter invariant is `listDue`: same `due <= now` filter, same
 * ascending order (by due, then id) whether filtered in memory or in SQL (LSP).
 */
export interface ReviewRepositoryContractCase {
  readonly name: string;
  readonly makeRepo: () => ReviewRepository;
  readonly dispose?: (repo: ReviewRepository) => void;
}

const T0 = 1_700_000_000_000;

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
  id: 'en:hello',
  vocabId: 'en:hello',
  due: T0,
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

export const runReviewRepositoryContract = (
  testCase: ReviewRepositoryContractCase,
): void => {
  describe(`ReviewRepository contract: ${testCase.name}`, () => {
    let repo: ReviewRepository;

    beforeEach(() => {
      repo = testCase.makeRepo();
    });

    afterEach(() => {
      testCase.dispose?.(repo);
    });

    it('returns undefined for a missing id', async () => {
      expect(await repo.get('nope')).toBeUndefined();
    });

    it('round-trips a card, preserving every field', async () => {
      const c = card({ lastReviewedAt: T0 - 1000 });
      await repo.upsert(c);
      expect(await repo.get(c.id)).toEqual(c);
    });

    it('omits an absent lastReviewedAt (exactOptionalPropertyTypes)', async () => {
      const c = card();
      await repo.upsert(c);
      const got = await repo.get(c.id);
      expect(got).toEqual(c);
      expect(got && 'lastReviewedAt' in got).toBe(false);
    });

    it('overwrites an existing id (upsert)', async () => {
      await repo.upsert(card({ reps: 0 }));
      await repo.upsert(card({ reps: 3 }));
      expect((await repo.get('en:hello'))?.reps).toBe(3);
      expect(await repo.list()).toHaveLength(1);
    });

    it('listDue includes cards due at or before now, excludes later ones', async () => {
      await repo.upsert(card({ id: 'a', due: T0 - 10 }));
      await repo.upsert(card({ id: 'b', due: T0 }));
      await repo.upsert(card({ id: 'c', due: T0 + 10 }));
      const due = await repo.listDue(T0);
      expect(due.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('listDue orders by due ascending, then id', async () => {
      await repo.upsert(card({ id: 'z', due: T0 - 5 }));
      await repo.upsert(card({ id: 'a', due: T0 - 5 }));
      await repo.upsert(card({ id: 'm', due: T0 - 10 }));
      const due = await repo.listDue(T0);
      expect(due.map((c) => c.id)).toEqual(['m', 'a', 'z']);
    });

    it('deletes an id idempotently', async () => {
      await repo.upsert(card());
      await repo.delete('en:hello');
      expect(await repo.get('en:hello')).toBeUndefined();
      await repo.delete('en:hello');
      expect(await repo.list()).toHaveLength(0);
    });

    it('clears every card idempotently (right to erasure)', async () => {
      await repo.upsert(card({ id: 'a', due: T0 - 10 }));
      await repo.upsert(card({ id: 'b', due: T0 + 10 }));
      await repo.clear();
      expect(await repo.list()).toHaveLength(0);
      expect(await repo.listDue(T0)).toHaveLength(0);
      await repo.clear(); // no throw on an already-empty repository
      expect(await repo.list()).toHaveLength(0);
    });
  });
};
