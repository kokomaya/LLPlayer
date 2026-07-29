// Headless history/favorites/rename store for streamed URLs (Epic A · aligns
// with SubX's recent-list behavior). Keeps the list logic — de-dup, most-recent
// ordering, cap, rename, favorite toggle — as pure transforms, and reads/writes
// through an injected persistence port so this core never touches the
// filesystem. The clock is injected (`now`), never `Date.now()`, so ordering is
// deterministic under test (rule ①: no wall clock for logic).

/** A remembered streaming source the learner can replay from the home screen. */
export interface RecentSource {
  readonly uri: string;
  readonly title: string;
  readonly favorite: boolean;
  /** Epoch ms of the last time it was opened (from the injected clock). */
  readonly lastOpenedAt: number;
}

/** Persistence port — device wires this to an `expo-file-system` JSON file. */
export interface RecentSourcesStore {
  load(): Promise<readonly RecentSource[]>;
  save(list: readonly RecentSource[]): Promise<void>;
}

/** Hard cap on remembered entries; oldest beyond this are dropped. */
export const RECENT_SOURCES_CAP = 50;

// ── Pure list transforms (exported for direct unit testing) ────────────────

/**
 * Insert/refresh `entry` at the front: any existing entry with the same `uri` is
 * removed first (so the URL never duplicates), then the list is capped to
 * {@link RECENT_SOURCES_CAP}. A pre-existing entry's `favorite` flag is
 * preserved unless `entry` overrides it.
 */
export const upsertRecent = (
  list: readonly RecentSource[],
  entry: RecentSource,
): readonly RecentSource[] => {
  const prior = list.find((s) => s.uri === entry.uri);
  const merged: RecentSource = prior
    ? { ...entry, favorite: entry.favorite || prior.favorite }
    : entry;
  const rest = list.filter((s) => s.uri !== entry.uri);
  return [merged, ...rest].slice(0, RECENT_SOURCES_CAP);
};

/** Return a copy with the entry matching `uri` transformed by `fn`. */
export const mapRecent = (
  list: readonly RecentSource[],
  uri: string,
  fn: (s: RecentSource) => RecentSource,
): readonly RecentSource[] =>
  list.map((s) => (s.uri === uri ? fn(s) : s));

// ── Controller over the store ──────────────────────────────────────────────

export interface RecentSourcesDeps {
  readonly store: RecentSourcesStore;
  /** Clock for `lastOpenedAt`; injected so tests stay deterministic. */
  readonly now: () => number;
}

/** History/favorites/rename operations backed by the persistence port. */
export interface RecentSources {
  /** All remembered sources, most-recently-opened first. */
  list(): Promise<readonly RecentSource[]>;
  /** Favorited sources only, most-recently-opened first. */
  favorites(): Promise<readonly RecentSource[]>;
  /** Record that `uri` was opened now (de-dups + moves to front). */
  add(uri: string, title: string): Promise<readonly RecentSource[]>;
  /** Give `uri` a new display title (no-op if absent). */
  rename(uri: string, title: string): Promise<readonly RecentSource[]>;
  /** Flip the favorite flag of `uri` (no-op if absent). */
  toggleFavorite(uri: string): Promise<readonly RecentSource[]>;
  /** Forget `uri` entirely. */
  remove(uri: string): Promise<readonly RecentSource[]>;
  /** Forget every remembered source (history + favorites) — always returns []. */
  clear(): Promise<readonly RecentSource[]>;
}

/**
 * Build a {@link RecentSources} over an injected {@link RecentSourcesStore} and
 * clock. Every mutation loads the current list, applies a pure transform, saves,
 * and returns the new list — so callers can render the result without a reload.
 */
export const createRecentSources = (deps: RecentSourcesDeps): RecentSources => {
  const { store, now } = deps;

  const mutate = async (
    fn: (list: readonly RecentSource[]) => readonly RecentSource[],
  ): Promise<readonly RecentSource[]> => {
    const next = fn(await store.load());
    await store.save(next);
    return next;
  };

  return {
    list: () => store.load(),
    favorites: async () => (await store.load()).filter((s) => s.favorite),
    add: (uri, title) =>
      mutate((list) =>
        upsertRecent(list, {
          uri,
          title,
          favorite: false,
          lastOpenedAt: now(),
        }),
      ),
    rename: (uri, title) =>
      mutate((list) => mapRecent(list, uri, (s) => ({ ...s, title }))),
    toggleFavorite: (uri) =>
      mutate((list) =>
        mapRecent(list, uri, (s) => ({ ...s, favorite: !s.favorite })),
      ),
    remove: (uri) => mutate((list) => list.filter((s) => s.uri !== uri)),
    clear: () => mutate(() => []),
  };
};
