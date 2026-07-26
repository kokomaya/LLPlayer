import type { LanguageCode, Lemma } from '@aurora/domain';

/** One meaning of a headword. */
export interface DictionarySense {
  readonly definition: string;
  readonly partOfSpeech?: string;
  readonly examples?: readonly string[];
}

/**
 * A normalized dictionary result (plan/05 · dictionary). Provider-agnostic so
 * an offline JSON provider and an online API provider return the same shape and
 * are interchangeable behind {@link DictionaryRegistry} (LSP).
 */
export interface DictionaryEntry {
  readonly headword: string;
  readonly senses: readonly DictionarySense[];
  readonly phonetics?: string;
  /** {@link IDictionaryProvider.id} of the provider that produced this entry. */
  readonly sourceId: string;
}

/**
 * Port for a dictionary lookup source — the OCP/DIP seam. A new source (online
 * API, bundled offline file, LLM gloss) means a new implementation registered
 * with {@link DictionaryRegistry}; no core code changes and nothing downstream
 * learns a concrete backend. Async so network-backed providers fit the same
 * contract as in-memory ones.
 */
export interface IDictionaryProvider {
  readonly id: string;
  /**
   * Look a word up. Implementations normalize the input themselves (via
   * {@link normalizeLemma}) so `"Hello!"` and `"hello"` resolve alike. Returns
   * `null` when the word is unknown to this provider (a miss, not an error).
   */
  lookup(word: string | Lemma, lang: LanguageCode): Promise<DictionaryEntry | null>;
}
