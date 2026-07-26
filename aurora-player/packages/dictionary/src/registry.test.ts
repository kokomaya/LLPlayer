import { languageCode, type LanguageCode } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './default-registry.js';
import { DictionaryRegistry } from './registry.js';
import { StaticDictionaryProvider } from './providers/static-dictionary-provider.js';
import type { DictionaryEntry } from './port.js';

const EN: LanguageCode = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();

const entry = (headword: string): DictionaryEntry => ({
  headword,
  senses: [{ definition: `def of ${headword}` }],
  sourceId: 'seed',
});

describe('DictionaryRegistry', () => {
  it('returns the first provider that has a hit (ordered fallback)', async () => {
    const registry = new DictionaryRegistry()
      .register(new StaticDictionaryProvider('primary', { apple: entry('apple') }))
      .register(new StaticDictionaryProvider('secondary', { banana: entry('banana') }));

    const primary = await registry.lookup('apple', EN);
    expect(primary?.sourceId).toBe('primary');

    // Not in primary → falls through to secondary.
    const secondary = await registry.lookup('banana', EN);
    expect(secondary?.sourceId).toBe('secondary');
  });

  it('returns null when no provider resolves the word', async () => {
    const registry = new DictionaryRegistry().register(
      new StaticDictionaryProvider('p', { apple: entry('apple') }),
    );
    expect(await registry.lookup('missing', EN)).toBeNull();
  });

  it('exposes registered providers in order', () => {
    const a = new StaticDictionaryProvider('a', {});
    const b = new StaticDictionaryProvider('b', {});
    const registry = new DictionaryRegistry().register(a).register(b);
    expect(registry.providers.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('createDefaultRegistry resolves a bundled word offline', async () => {
    const hit = await createDefaultRegistry().lookup('world', EN);
    expect(hit?.headword).toBe('world');
    expect(hit?.sourceId).toBe('builtin');
  });
});
