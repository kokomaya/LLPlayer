import type { LanguageCode, Lemma } from '@aurora/domain';
import type { DictionaryEntry, IDictionaryProvider } from './port.js';

/**
 * Ordered aggregation of {@link IDictionaryProvider}s (plan/05 · dictionary).
 * `lookup` tries each provider in registration order and returns the first hit,
 * so a fast/offline provider can front a slower online one (graceful
 * degradation). Adding a source = `register(...)`; the registry never grows a
 * `switch (source)` (OCP), mirroring `ParserRegistry` in the subtitle package.
 */
export class DictionaryRegistry {
  readonly #providers: IDictionaryProvider[] = [];

  register(provider: IDictionaryProvider): this {
    this.#providers.push(provider);
    return this;
  }

  get providers(): readonly IDictionaryProvider[] {
    return this.#providers;
  }

  async lookup(
    word: string | Lemma,
    lang: LanguageCode,
  ): Promise<DictionaryEntry | null> {
    for (const provider of this.#providers) {
      const entry = await provider.lookup(word, lang);
      if (entry) {
        return entry;
      }
    }
    return null;
  }
}
