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
import { getDue } from './get-due.js';
import { gradeReview } from './grade-review.js';
import { vocabId } from './ids.js';

// Local in-memory fakes: learning may depend only on the kernel, never on
// @aurora/storage (domain→domain ban), so its unit tests supply their own.
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

describe('learning use-cases (define → add → review → grade)', () => {
  let vocab: FakeVocabRepo;
  let reviews: FakeReviewRepo;
  let scheduler: FsrsScheduler;

  beforeEach(() => {
    vocab = new FakeVocabRepo();
    reviews = new FakeReviewRepo();
    scheduler = new FsrsScheduler();
  });

  it('addVocabulary saves an entry + due-now card and is idempotent', async () => {
    const first = await addVocabulary(
      { vocab, reviews, scheduler },
      { lemma: lemma('Hello'), lang: EN, now: T0, context: 'Hello world' },
    );
    expect(first.created).toBe(true);
    expect(first.entry.id).toBe(vocabId(EN, lemma('hello')));
    expect(first.entry.context).toBe('Hello world');
    expect(first.card.due).toBe(T0); // due immediately

    const again = await addVocabulary(
      { vocab, reviews, scheduler },
      { lemma: lemma('hello'), lang: EN, now: T0 + 5000 },
    );
    expect(again.created).toBe(false);
    expect((await vocab.list()).length).toBe(1);
  });

  it('getDue surfaces the new card at t0, then hides it after a good grade', async () => {
    const { card } = await addVocabulary(
      { vocab, reviews, scheduler },
      { lemma: lemma('world'), lang: EN, now: T0 },
    );

    const dueNow = await getDue(reviews, T0);
    expect(dueNow.map((c) => c.id)).toEqual([card.id]);

    const graded = await gradeReview(
      { reviews, scheduler },
      { id: card.id, rating: 'good', now: T0 },
    );
    expect(graded.due).toBeGreaterThan(T0);

    // No longer due at T0; due again at/after its new due time.
    expect(await getDue(reviews, T0)).toHaveLength(0);
    expect((await getDue(reviews, graded.due)).map((c) => c.id)).toEqual([card.id]);
  });

  it('getDue returns cards ascending by due time', async () => {
    const a = await addVocabulary({ vocab, reviews, scheduler }, { lemma: lemma('alpha'), lang: EN, now: T0 });
    const b = await addVocabulary({ vocab, reviews, scheduler }, { lemma: lemma('beta'), lang: EN, now: T0 });
    // Grade one so their due times differ.
    await gradeReview({ reviews, scheduler }, { id: a.card.id, rating: 'again', now: T0 });
    const due = await getDue(reviews, T0 + 10 * 86_400_000);
    const times = due.map((c) => c.due);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(due.map((c) => c.id).sort()).toEqual([a.card.id, b.card.id].sort());
  });

  it('gradeReview throws NotFoundError for an unknown card', async () => {
    await expect(
      gradeReview({ reviews, scheduler }, { id: 'nope', rating: 'good', now: T0 }),
    ).rejects.toThrow(/No review card/);
  });
});
