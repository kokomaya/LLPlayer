import { languageCode, type LanguageCode } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { runDictionaryProviderContract } from '../contract/dictionary-provider-contract.js';
import { BUILTIN_EN } from './builtin-data.js';
import { StaticDictionaryProvider } from './static-dictionary-provider.js';

const EN = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();

// LSP: the bundled offline provider satisfies the shared provider contract.
runDictionaryProviderContract({
  name: 'StaticDictionaryProvider (builtin en)',
  makeProvider: () => new StaticDictionaryProvider('builtin', BUILTIN_EN),
  lang: EN,
  knownWord: 'hello',
  knownVariant: 'Hello!',
  unknownWord: 'zzzznotaword',
});

describe('StaticDictionaryProvider language scoping', () => {
  const FR: LanguageCode = (() => {
    const r = languageCode('fr');
    if (!r.ok) throw r.error;
    return r.value;
  })();

  it('answers regardless of language when no lang is configured', async () => {
    const p = new StaticDictionaryProvider('builtin', BUILTIN_EN);
    expect(await p.lookup('hello', FR)).not.toBeNull();
  });

  it('misses for a non-matching language when a lang is configured', async () => {
    const p = new StaticDictionaryProvider('builtin', BUILTIN_EN, EN);
    expect(await p.lookup('hello', EN)).not.toBeNull();
    expect(await p.lookup('hello', FR)).toBeNull();
  });
});
