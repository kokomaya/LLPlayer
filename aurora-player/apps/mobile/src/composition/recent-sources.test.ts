import { describe, expect, it } from 'vitest';
import {
  RECENT_SOURCES_CAP,
  createRecentSources,
  mapRecent,
  upsertRecent,
  type RecentSource,
  type RecentSourcesStore,
} from './recent-sources.js';

const src = (uri: string, over: Partial<RecentSource> = {}): RecentSource => ({
  uri,
  title: uri,
  favorite: false,
  lastOpenedAt: 0,
  ...over,
});

/** In-memory store + a peek at the persisted bytes, for round-trip assertions. */
const makeStore = (initial: readonly RecentSource[] = []) => {
  let data: readonly RecentSource[] = [...initial];
  const store: RecentSourcesStore = {
    load: async () => data,
    save: async (list) => {
      data = [...list];
    },
  };
  return { store, peek: () => data };
};

/** A hand-cranked clock so ordering/timestamps are deterministic. */
const makeClock = (start = 1000) => {
  let t = start;
  return () => (t += 1);
};

describe('upsertRecent (pure)', () => {
  it('de-dups by uri and moves the entry to the front', () => {
    const list = [src('a'), src('b'), src('c')];
    const next = upsertRecent(list, src('c', { title: 'C2' }));
    expect(next.map((s) => s.uri)).toEqual(['c', 'a', 'b']);
    expect(next[0]!.title).toBe('C2');
  });

  it('preserves a prior favorite flag when re-adding', () => {
    const list = [src('a', { favorite: true })];
    const next = upsertRecent(list, src('a', { favorite: false }));
    expect(next[0]!.favorite).toBe(true);
  });

  it('caps the list length, dropping the oldest', () => {
    const list = Array.from({ length: RECENT_SOURCES_CAP }, (_, i) => src(`u${i}`));
    const next = upsertRecent(list, src('new'));
    expect(next).toHaveLength(RECENT_SOURCES_CAP);
    expect(next[0]!.uri).toBe('new');
    expect(next.some((s) => s.uri === `u${RECENT_SOURCES_CAP - 1}`)).toBe(false);
  });
});

describe('mapRecent (pure)', () => {
  it('transforms only the matching entry', () => {
    const list = [src('a'), src('b')];
    const next = mapRecent(list, 'b', (s) => ({ ...s, title: 'B!' }));
    expect(next.map((s) => s.title)).toEqual(['a', 'B!']);
  });
});

describe('createRecentSources', () => {
  it('add records with the injected clock and de-dups to the front', async () => {
    const { store, peek } = makeStore();
    const recent = createRecentSources({ store, now: makeClock() });
    await recent.add('a', 'A');
    await recent.add('b', 'B');
    const list = await recent.add('a', 'A again');
    expect(list.map((s) => s.uri)).toEqual(['a', 'b']);
    expect(list[0]!.lastOpenedAt).toBeGreaterThan(list[1]!.lastOpenedAt);
    expect(peek()).toEqual(list); // persisted
  });

  it('rename changes only the display title', async () => {
    const { store } = makeStore([src('a', { title: 'old' })]);
    const recent = createRecentSources({ store, now: makeClock() });
    const list = await recent.rename('a', 'new');
    expect(list[0]!.title).toBe('new');
  });

  it('toggleFavorite flips the flag and favorites() filters', async () => {
    const { store } = makeStore([src('a'), src('b')]);
    const recent = createRecentSources({ store, now: makeClock() });
    await recent.toggleFavorite('a');
    expect((await recent.favorites()).map((s) => s.uri)).toEqual(['a']);
    await recent.toggleFavorite('a');
    expect(await recent.favorites()).toEqual([]);
  });

  it('remove forgets the entry', async () => {
    const { store } = makeStore([src('a'), src('b')]);
    const recent = createRecentSources({ store, now: makeClock() });
    const list = await recent.remove('a');
    expect(list.map((s) => s.uri)).toEqual(['b']);
  });

  it('list/favorites read straight from the store (survive a reload)', async () => {
    const { store } = makeStore();
    const recent = createRecentSources({ store, now: makeClock() });
    await recent.add('a', 'A');
    await recent.toggleFavorite('a');
    // A fresh controller over the SAME store sees the persisted state.
    const reopened = createRecentSources({ store, now: makeClock() });
    expect((await reopened.list()).map((s) => s.uri)).toEqual(['a']);
    expect((await reopened.favorites()).map((s) => s.uri)).toEqual(['a']);
  });
});
