import { type LanguageCode, type Lemma, normalizeLemma } from '@aurora/domain';
import type { DictionaryEntry, IDictionaryProvider } from '../port.js';

/**
 * Offline, in-memory {@link IDictionaryProvider} backed by a lemma→entry map
 * (plan/05 · dictionary — "≥1 offline provider"). The reference implementation:
 * no network, no API key, fully deterministic, so it can front the registry in
 * tests and ship as a bundled fallback. Entries are keyed by
 * {@link normalizeLemma} so lookups are case- and punctuation-insensitive.
 */
export class StaticDictionaryProvider implements IDictionaryProvider {
  readonly #entries: ReadonlyMap<string, DictionaryEntry>;

  /**
   * @param id Stamped onto every returned entry's `sourceId`.
   * @param entries Raw word → entry map; keys are normalized on construction.
   * @param lang Optional language this provider serves; when set, lookups for a
   *   different language miss (so several single-language providers can coexist
   *   in one registry). Omit to answer regardless of the requested language.
   */
  constructor(
    readonly id: string,
    entries: Readonly<Record<string, DictionaryEntry>>,
    private readonly lang?: LanguageCode,
  ) {
    const normalized = new Map<string, DictionaryEntry>();
    for (const [word, entry] of Object.entries(entries)) {
      normalized.set(normalizeLemma(word), { ...entry, sourceId: id });
    }
    this.#entries = normalized;
  }

  lookup(
    word: string | Lemma,
    lang: LanguageCode,
  ): Promise<DictionaryEntry | null> {
    if (this.lang !== undefined && this.lang !== lang) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.#entries.get(normalizeLemma(word)) ?? null);
  }
}
