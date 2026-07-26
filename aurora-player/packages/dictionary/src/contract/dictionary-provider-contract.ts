import { describe, expect, it } from 'vitest';
import type { LanguageCode } from '@aurora/domain';
import type { IDictionaryProvider } from '../port.js';

/**
 * Reusable behaviour spec for {@link IDictionaryProvider} implementations
 * (plan/09 §1). Any provider that passes is a drop-in substitute behind
 * {@link DictionaryRegistry} (LSP). The case supplies words the provider is
 * known to resolve so the same suite fits an offline map, an online API, or an
 * LLM gloss without change.
 */
export interface DictionaryProviderContractCase {
  readonly name: string;
  readonly makeProvider: () => IDictionaryProvider;
  readonly lang: LanguageCode;
  /** A word the provider resolves. */
  readonly knownWord: string;
  /** The same word with different case/surrounding punctuation. */
  readonly knownVariant: string;
  /** A word the provider does not know. */
  readonly unknownWord: string;
}

export const runDictionaryProviderContract = (
  testCase: DictionaryProviderContractCase,
): void => {
  describe(`IDictionaryProvider contract: ${testCase.name}`, () => {
    it('resolves a known word to an entry stamped with its own id', async () => {
      const provider = testCase.makeProvider();
      const entry = await provider.lookup(testCase.knownWord, testCase.lang);
      expect(entry).not.toBeNull();
      expect(entry!.senses.length).toBeGreaterThan(0);
      expect(entry!.senses[0]!.definition.length).toBeGreaterThan(0);
      expect(entry!.sourceId).toBe(provider.id);
    });

    it('is case- and punctuation-insensitive (lemma normalization)', async () => {
      const provider = testCase.makeProvider();
      const canonical = await provider.lookup(testCase.knownWord, testCase.lang);
      const variant = await provider.lookup(testCase.knownVariant, testCase.lang);
      expect(variant).not.toBeNull();
      expect(variant!.headword).toBe(canonical!.headword);
    });

    it('returns null for an unknown word (a miss, not a throw)', async () => {
      const provider = testCase.makeProvider();
      expect(await provider.lookup(testCase.unknownWord, testCase.lang)).toBeNull();
    });

    it('is pure — repeated lookups yield an equal result', async () => {
      const provider = testCase.makeProvider();
      const a = await provider.lookup(testCase.knownWord, testCase.lang);
      const b = await provider.lookup(testCase.knownWord, testCase.lang);
      expect(b).toEqual(a);
    });
  });
};
