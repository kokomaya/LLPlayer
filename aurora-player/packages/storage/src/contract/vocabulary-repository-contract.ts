import type {
  LanguageCode,
  Lemma,
  VocabEntry,
  VocabularyRepository,
} from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for {@link VocabularyRepository} implementations
 * (plan/09 §1). Running the identical suite against every adapter is how LSP
 * becomes verifiable: any adapter that passes substitutes for the port.
 */
export interface VocabularyRepositoryContractCase {
  readonly name: string;
  /** Fresh, empty repository per test. */
  readonly makeRepo: () => VocabularyRepository;
  /** Optional teardown (e.g. closing a DB handle). */
  readonly dispose?: (repo: VocabularyRepository) => void;
}

const entry = (over: Partial<VocabEntry> = {}): VocabEntry => ({
  id: 'en:hello',
  lemma: 'hello' as Lemma,
  lang: 'en' as LanguageCode,
  status: 'learning',
  createdAt: 1_700_000_000_000,
  ...over,
});

export const runVocabularyRepositoryContract = (
  testCase: VocabularyRepositoryContractCase,
): void => {
  describe(`VocabularyRepository contract: ${testCase.name}`, () => {
    let repo: VocabularyRepository;

    beforeEach(() => {
      repo = testCase.makeRepo();
    });

    afterEach(() => {
      testCase.dispose?.(repo);
    });

    it('returns undefined for a missing id', async () => {
      expect(await repo.get('nope')).toBeUndefined();
    });

    it('round-trips an entry, preserving every field', async () => {
      const e = entry({ context: 'a friendly greeting' });
      await repo.upsert(e);
      expect(await repo.get(e.id)).toEqual(e);
    });

    it('omits an absent optional context (exactOptionalPropertyTypes)', async () => {
      const e = entry();
      await repo.upsert(e);
      const got = await repo.get(e.id);
      expect(got).toEqual(e);
      expect(got && 'context' in got).toBe(false);
    });

    it('round-trips tags and category', async () => {
      const e = entry({ tags: ['deck-1', 'topic:greetings'], category: 'phrases' });
      await repo.upsert(e);
      expect(await repo.get(e.id)).toEqual(e);
    });

    it('preserves an explicitly empty tags list distinctly from absent', async () => {
      const e = entry({ tags: [] });
      await repo.upsert(e);
      const got = await repo.get(e.id);
      expect(got).toEqual(e);
      expect(got?.tags).toEqual([]);
    });

    it('omits absent tags/category (exactOptionalPropertyTypes)', async () => {
      const e = entry();
      await repo.upsert(e);
      const got = await repo.get(e.id);
      expect(got && 'tags' in got).toBe(false);
      expect(got && 'category' in got).toBe(false);
    });

    it('updates tags/category on upsert overwrite', async () => {
      await repo.upsert(entry({ tags: ['old'], category: 'a' }));
      await repo.upsert(entry({ tags: ['new'], category: 'b' }));
      const got = await repo.get('en:hello');
      expect(got?.tags).toEqual(['new']);
      expect(got?.category).toBe('b');
    });

    it('overwrites an existing id (upsert)', async () => {
      await repo.upsert(entry({ status: 'learning' }));
      await repo.upsert(entry({ status: 'known' }));
      expect((await repo.get('en:hello'))?.status).toBe('known');
      expect(await repo.list()).toHaveLength(1);
    });

    it('lists all entries', async () => {
      await repo.upsert(entry({ id: 'en:hello' }));
      await repo.upsert(entry({ id: 'en:world', lemma: 'world' as Lemma }));
      expect((await repo.list()).map((e) => e.id).sort()).toEqual([
        'en:hello',
        'en:world',
      ]);
    });

    it('deletes an id idempotently', async () => {
      await repo.upsert(entry());
      await repo.delete('en:hello');
      expect(await repo.get('en:hello')).toBeUndefined();
      await repo.delete('en:hello'); // no throw on a missing id
      expect(await repo.list()).toHaveLength(0);
    });

    it('clears every entry idempotently (right to erasure)', async () => {
      await repo.upsert(entry({ id: 'en:hello' }));
      await repo.upsert(entry({ id: 'en:world', lemma: 'world' as Lemma }));
      await repo.clear();
      expect(await repo.list()).toHaveLength(0);
      await repo.clear(); // no throw on an already-empty repository
      expect(await repo.list()).toHaveLength(0);
    });
  });
};
