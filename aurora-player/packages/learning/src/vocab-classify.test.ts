import type { LanguageCode, Lemma, VocabEntry } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import {
  countByCategory,
  countByTag,
  distinctCategories,
  distinctTags,
  filterByCategory,
  filterByTag,
  groupByCategory,
  UNCATEGORIZED,
} from './vocab-classify.js';

const entry = (over: Partial<VocabEntry> & { id: string }): VocabEntry => ({
  lemma: 'w' as Lemma,
  lang: 'en' as LanguageCode,
  status: 'learning',
  createdAt: 1_700_000_000_000,
  ...over,
});

// A small mixed corpus: two categories, one uncategorized, overlapping tags.
const corpus: readonly VocabEntry[] = [
  entry({ id: 'a', category: 'phrases', tags: ['deck-1', 'topic:food'] }),
  entry({ id: 'b', category: 'phrases', tags: ['deck-1'] }),
  entry({ id: 'c', category: 'grammar', tags: ['topic:food'] }),
  entry({ id: 'd' }), // uncategorized, untagged
];

describe('filterByCategory', () => {
  it('selects entries filed under a category, preserving order', () => {
    expect(filterByCategory(corpus, 'phrases').map((e) => e.id)).toEqual([
      'a',
      'b',
    ]);
  });

  it('selects the uncategorized entries via UNCATEGORIZED', () => {
    expect(filterByCategory(corpus, UNCATEGORIZED).map((e) => e.id)).toEqual([
      'd',
    ]);
  });

  it('does not treat a literal "null" category as uncategorized', () => {
    const mixed = [entry({ id: 'x', category: 'null' }), entry({ id: 'y' })];
    expect(filterByCategory(mixed, UNCATEGORIZED).map((e) => e.id)).toEqual([
      'y',
    ]);
    expect(filterByCategory(mixed, 'null').map((e) => e.id)).toEqual(['x']);
  });
});

describe('filterByTag', () => {
  it('selects entries carrying the tag', () => {
    expect(filterByTag(corpus, 'deck-1').map((e) => e.id)).toEqual(['a', 'b']);
    expect(filterByTag(corpus, 'topic:food').map((e) => e.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('returns nothing for an unknown tag or untagged corpus', () => {
    expect(filterByTag(corpus, 'nope')).toEqual([]);
    expect(filterByTag([entry({ id: 'd' })], 'deck-1')).toEqual([]);
  });
});

describe('groupByCategory', () => {
  it('partitions by category, uncategorized under UNCATEGORIZED', () => {
    const groups = groupByCategory(corpus);
    expect(groups.get('phrases')?.map((e) => e.id)).toEqual(['a', 'b']);
    expect(groups.get('grammar')?.map((e) => e.id)).toEqual(['c']);
    expect(groups.get(UNCATEGORIZED)?.map((e) => e.id)).toEqual(['d']);
  });

  it('is empty for an empty corpus', () => {
    expect(groupByCategory([]).size).toBe(0);
  });
});

describe('countByCategory', () => {
  it('counts entries per category including UNCATEGORIZED', () => {
    const counts = countByCategory(corpus);
    expect(counts.get('phrases')).toBe(2);
    expect(counts.get('grammar')).toBe(1);
    expect(counts.get(UNCATEGORIZED)).toBe(1);
  });
});

describe('countByTag', () => {
  it('counts each distinct tag, once per entry even if repeated', () => {
    const counts = countByTag([
      ...corpus,
      entry({ id: 'e', tags: ['deck-1', 'deck-1'] }),
    ]);
    expect(counts.get('deck-1')).toBe(3);
    expect(counts.get('topic:food')).toBe(2);
  });
});

describe('distinctCategories', () => {
  it('lists the distinct non-null categories, sorted', () => {
    expect(distinctCategories(corpus)).toEqual(['grammar', 'phrases']);
  });
});

describe('distinctTags', () => {
  it('lists the distinct tags across all entries, sorted', () => {
    expect(distinctTags(corpus)).toEqual(['deck-1', 'topic:food']);
  });

  it('is empty when nothing is tagged', () => {
    expect(distinctTags([entry({ id: 'd' })])).toEqual([]);
  });
});
