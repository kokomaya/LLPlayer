import type { DictionaryEntry } from '../port.js';

/**
 * A tiny bundled English word list so the offline provider (and the CLI
 * `define`) works out of the box with zero network/keys. Intentionally small —
 * a real deployment swaps in a full offline dataset or an online provider. Keys
 * are raw words; {@link StaticDictionaryProvider} normalizes them to lemmas.
 * `sourceId` is overwritten by the provider, so a placeholder is fine here.
 */
export const BUILTIN_EN: Readonly<Record<string, DictionaryEntry>> = {
  hello: {
    headword: 'hello',
    phonetics: 'həˈloʊ',
    sourceId: 'builtin',
    senses: [
      { partOfSpeech: 'exclamation', definition: 'Used as a greeting.' },
      { partOfSpeech: 'noun', definition: 'An utterance of "hello"; a greeting.' },
    ],
  },
  world: {
    headword: 'world',
    phonetics: 'wɜːrld',
    sourceId: 'builtin',
    senses: [
      { partOfSpeech: 'noun', definition: 'The earth, together with all of its people.' },
    ],
  },
  fine: {
    headword: 'fine',
    phonetics: 'faɪn',
    sourceId: 'builtin',
    senses: [
      { partOfSpeech: 'adjective', definition: 'Of high quality; very good.' },
      { partOfSpeech: 'adjective', definition: 'In good health or well-being.' },
    ],
  },
};
