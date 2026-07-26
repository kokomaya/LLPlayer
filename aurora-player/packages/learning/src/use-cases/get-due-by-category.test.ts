import {
  languageCode,
  normalizeLemma,
  type LanguageCode,
  type Lemma,
  type ReviewCard,
  type ReviewRepository,
  type VocabEntry,
  type VocabularyRepository,
} from '@aurora/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { FsrsScheduler } from '../schedulers/fsrs-scheduler.js';
import { addVocabulary } from './add-vocabulary.js';
import { getDueByCategory } from './get-due-by-category.js';

// Kernel-only fakes (learning may not depend on @aurora/storage).
class FakeVocabRepo implements VocabularyRepository {
  readonly map = new Map<string, VocabEntry>();
  upsert(e: VocabEntry): Promise<void> {
    this.map.set(e.id, e);
    return Promise.resolve();
  }
  get(id: string): Promise<VocabEntry | undefined> {
    return Promise.resolve(this.map.get(id));
  }
  list(): Promise<readonly VocabEntry[]> {
    return Promise.resolve([...this.map.values()]);
  }
  delete(id: string): Promise<void> {
    this.map.delete(id);
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
}

class FakeReviewRepo implements ReviewRepository {
  readonly map = new Map<string, ReviewCard>();
  upsert(c: ReviewCard): Promise<void> {
    this.map.set(c.id, c);
    return Promise.resolve();
  }
  get(id: string): Promise<ReviewCard | undefined> {
    return Promise.resolve(this.map.get(id));
  }
  list(): Promise<readonly ReviewCard[]> {
    return Promise.resolve([...this.map.values()]);
  }
  listDue(now: number): Promise<readonly ReviewCard[]> {
    return Promise.resolve(
      [...this.map.values()]
        .filter((c) => c.due <= now)
        .sort((a, b) => a.due - b.due || a.id.localeCompare(b.id)),
    );
  }
  delete(id: string): Promise<void> {
    this.map.delete(id);
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
}

const EN: LanguageCode = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();
const lemma = (w: string): Lemma => normalizeLemma(w);
const T0 = 1_700_000_000_000;

describe('getDueByCategory', () => {
  let vocab: FakeVocabRepo;
  let reviews: FakeReviewRepo;
  let scheduler: FsrsScheduler;

  const add = (word: string, category?: string): Promise<unknown> =>
    addVocabulary(
      { vocab, reviews, scheduler },
      {
        lemma: lemma(word),
        lang: EN,
        now: T0,
        ...(category !== undefined ? { category } : {}),
      },
    );

  beforeEach(async () => {
    vocab = new FakeVocabRepo();
    reviews = new FakeReviewRepo();
    scheduler = new FsrsScheduler();
    await add('alpha', 'phrases');
    await add('beta', 'phrases');
    await add('gamma', 'grammar');
    await add('delta'); // uncategorized
  });

  it('narrows the due queue to one category', async () => {
    const due = await getDueByCategory({ reviews, vocab }, T0, 'phrases');
    expect(due.map((c) => c.vocabId).sort()).toEqual([
      'en:alpha',
      'en:beta',
    ]);
  });

  it('selects the uncategorized words with a null category', async () => {
    const due = await getDueByCategory({ reviews, vocab }, T0, null);
    expect(due.map((c) => c.vocabId)).toEqual(['en:delta']);
  });

  it('returns nothing for an unknown category', async () => {
    expect(await getDueByCategory({ reviews, vocab }, T0, 'nope')).toEqual([]);
  });

  it('preserves getDue ordering (ascending due) within a category', async () => {
    const due = await getDueByCategory({ reviews, vocab }, T0, 'phrases');
    const times = due.map((c) => c.due);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('drops cards whose word is not yet due', async () => {
    // Nothing is due one tick before T0.
    expect(
      await getDueByCategory({ reviews, vocab }, T0 - 1, 'phrases'),
    ).toEqual([]);
  });
});
