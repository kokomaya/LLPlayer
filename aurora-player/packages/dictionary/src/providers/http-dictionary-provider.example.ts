/**
 * REFERENCE ONLY — excluded from the CI build/test/lint graph (`*.example.ts`).
 *
 * An online {@link IDictionaryProvider} sketch over a REST dictionary API. It
 * needs network access and (for most APIs) an API key, so it is NOT part of the
 * pure, hermetic core that CI unit-tests — it is validated off-CI against a live
 * endpoint. Its only job is to satisfy the SAME `IDictionaryProvider` port and
 * pass `runDictionaryProviderContract`, proving a network source is a drop-in
 * substitute for the offline one (LSP).
 *
 * SECURITY (repo rule §E): never hard-code or commit an API key. Read it from
 * an environment variable / untracked file at the composition root and inject it
 * here. This file contains only a placeholder env lookup.
 *
 * To activate off-CI: drop the `.example` segment, `pnpm add` a fetch polyfill
 * if on old Node, and register it after the offline provider in the registry.
 */
import { type LanguageCode, type Lemma, normalizeLemma } from '@aurora/domain';
import type { DictionaryEntry, IDictionaryProvider } from '../port.js';

export interface HttpDictionaryConfig {
  /** e.g. `https://api.example-dict.com/v1` */
  readonly baseUrl: string;
  /** Injected from `process.env.DICT_API_KEY` at the composition root. */
  readonly apiKey: string;
}

export class HttpDictionaryProvider implements IDictionaryProvider {
  readonly id = 'http';

  constructor(private readonly config: HttpDictionaryConfig) {}

  async lookup(
    word: string | Lemma,
    lang: LanguageCode,
  ): Promise<DictionaryEntry | null> {
    const lemma = normalizeLemma(word);
    const url = `${this.config.baseUrl}/lookup?word=${encodeURIComponent(lemma)}&lang=${lang}`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${this.config.apiKey}` },
    });
    if (res.status === 404) {
      return null; // a miss, not an error
    }
    if (!res.ok) {
      throw new Error(`dictionary API ${res.status}`);
    }
    const body = (await res.json()) as {
      headword: string;
      phonetics?: string;
      senses: Array<{ definition: string; partOfSpeech?: string }>;
    };
    return {
      headword: body.headword,
      ...(body.phonetics !== undefined ? { phonetics: body.phonetics } : {}),
      senses: body.senses,
      sourceId: this.id,
    };
  }
}
