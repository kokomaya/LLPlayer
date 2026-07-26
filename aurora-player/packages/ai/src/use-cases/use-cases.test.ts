import type { CacheRepository, LanguageCode } from '@aurora/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMRequest, LLMResponse } from '../port.js';
import { createLLMRuntime } from '../registry.js';
import { StaticLLMProvider } from '../providers/static-llm-provider.js';
import { translateLine } from './translate-line.js';
import { explainGrammar } from './explain-grammar.js';
import { explainWord } from './explain-word.js';

const T0 = 1_700_000_000_000;

/**
 * Tiny in-memory {@link CacheRepository} — `@aurora/ai` may not depend on
 * `@aurora/storage` (both `layer:domain`), so the use-case tests bring their own
 * kernel-port double. The storage adapters are proven separately by the shared
 * cache contract.
 */
class MapCache implements CacheRepository {
  readonly map = new Map<string, string>();
  get(key: string): Promise<string | undefined> {
    return Promise.resolve(this.map.get(key));
  }
  set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }
  delete(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}

/** Provider that counts how many times it was actually called. */
class CountingProvider implements ILLMProvider {
  readonly id = 'counting';
  calls = 0;
  complete(req: LLMRequest): Promise<LLMResponse> {
    this.calls += 1;
    return Promise.resolve({ text: `#${req.prompt}`, providerId: this.id });
  }
}

const es = 'es' as LanguageCode;

describe('AI capability use-cases', () => {
  let cache: MapCache;
  const now = (): number => T0;

  beforeEach(() => {
    cache = new MapCache();
  });

  it('translateLine returns provider text and stable fields', async () => {
    const provider = new StaticLLMProvider();
    const r = await translateLine({ provider, cache, now }, { text: 'hello', targetLang: es });
    expect(r.sourceText).toBe('hello');
    expect(r.targetLang).toBe(es);
    expect(r.cached).toBe(false);
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.providerId).toBe('offline');
  });

  it('caches by (provider, prompt): a repeat is served without re-calling', async () => {
    const provider = new CountingProvider();
    const first = await translateLine({ provider, cache, now }, { text: 'hello', targetLang: es });
    const second = await translateLine({ provider, cache, now }, { text: 'hello', targetLang: es });
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.text).toBe(first.text);
    expect(provider.calls).toBe(1); // dedup: provider hit exactly once
  });

  it('does not confuse capabilities or inputs in the cache', async () => {
    const provider = new CountingProvider();
    await translateLine({ provider, cache, now }, { text: 'hello', targetLang: es });
    await explainGrammar({ provider, cache, now }, { text: 'hello' });
    await explainWord({ provider, cache, now }, { word: 'hello' });
    await explainWord({ provider, cache, now }, { word: 'hello', context: 'a greeting' });
    expect(provider.calls).toBe(4); // four distinct keys → four calls
  });

  it('explainGrammar / explainWord surface their inputs', async () => {
    const provider = new StaticLLMProvider();
    const g = await explainGrammar({ provider, cache, now }, { text: 'I am fine' });
    expect(g.sourceText).toBe('I am fine');
    const w = await explainWord({ provider, cache, now }, { word: 'fine', context: 'I am fine' });
    expect(w.word).toBe('fine');
  });

  it('a hybrid runtime degrades to offline through the use-case', async () => {
    const failing: ILLMProvider = {
      id: 'online',
      complete: () => Promise.reject(new Error('offline network')),
    };
    const provider = createLLMRuntime({
      mode: 'hybrid',
      offline: new StaticLLMProvider(),
      online: failing,
    });
    const r = await translateLine({ provider, cache, now }, { text: 'hello', targetLang: es });
    expect(r.text).toContain('[offline]');
    expect(r.providerId).toBe('offline');
  });
});
