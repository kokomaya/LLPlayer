import type { VocabEntry } from '@aurora/domain';

/**
 * Pure classification helpers over saved words (plan · 生词分类). No I/O, no
 * clock, no repository — just deterministic reads of the additive
 * {@link VocabEntry.tags} / {@link VocabEntry.category} fields. UI and use-cases
 * compose these; they never reach into a store themselves.
 *
 * Grouping/counting bucket a word with no `category` under {@link UNCATEGORIZED}
 * (`null`), keeping "filed under the literal string 'null'" and "truly
 * uncategorized" distinct.
 */

/** Bucket key for entries that carry no `category`. */
export const UNCATEGORIZED = null;

/** The `category` of an entry, or {@link UNCATEGORIZED} when absent. */
const categoryKey = (entry: VocabEntry): string | null =>
  entry.category ?? UNCATEGORIZED;

/**
 * Entries filed under `category`. Pass {@link UNCATEGORIZED} (`null`) to select
 * the words that have no category. Input order is preserved.
 */
export const filterByCategory = (
  entries: readonly VocabEntry[],
  category: string | null,
): readonly VocabEntry[] =>
  entries.filter((e) => categoryKey(e) === category);

/**
 * Entries tagged with `tag` (exact match against a member of `tags`). An entry
 * with no `tags` never matches. Input order is preserved.
 */
export const filterByTag = (
  entries: readonly VocabEntry[],
  tag: string,
): readonly VocabEntry[] => entries.filter((e) => e.tags?.includes(tag) ?? false);

/**
 * Partition entries by category. The returned map preserves first-seen key
 * order and each bucket preserves input order; uncategorized words collect
 * under the {@link UNCATEGORIZED} key.
 */
export const groupByCategory = (
  entries: readonly VocabEntry[],
): ReadonlyMap<string | null, readonly VocabEntry[]> => {
  const out = new Map<string | null, VocabEntry[]>();
  for (const e of entries) {
    const key = categoryKey(e);
    const bucket = out.get(key);
    if (bucket) bucket.push(e);
    else out.set(key, [e]);
  }
  return out;
};

/** How many entries fall under each category (including {@link UNCATEGORIZED}). */
export const countByCategory = (
  entries: readonly VocabEntry[],
): ReadonlyMap<string | null, number> => {
  const out = new Map<string | null, number>();
  for (const e of entries) {
    const key = categoryKey(e);
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
};

/** How many entries carry each tag (a word counts once per distinct tag). */
export const countByTag = (
  entries: readonly VocabEntry[],
): ReadonlyMap<string, number> => {
  const out = new Map<string, number>();
  for (const e of entries) {
    for (const tag of new Set(e.tags ?? [])) {
      out.set(tag, (out.get(tag) ?? 0) + 1);
    }
  }
  return out;
};

/** The distinct non-null categories in use, sorted lexicographically. */
export const distinctCategories = (
  entries: readonly VocabEntry[],
): readonly string[] =>
  [
    ...new Set(
      entries.flatMap((e) => (e.category !== undefined ? [e.category] : [])),
    ),
  ].sort();

/** The distinct tags in use across all entries, sorted lexicographically. */
export const distinctTags = (
  entries: readonly VocabEntry[],
): readonly string[] =>
  [...new Set(entries.flatMap((e) => e.tags ?? []))].sort();
