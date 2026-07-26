import { languageCode, normalizeLemma, type VocabEntry } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { runExporterContract } from '../contract/exporter-contract.js';
import { AnkiExporter } from './anki-exporter.js';

const en = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();

const entry = (id: string, word: string, context?: string): VocabEntry => ({
  id,
  lemma: normalizeLemma(word),
  lang: en,
  status: 'learning',
  createdAt: 0,
  ...(context !== undefined ? { context } : {}),
});

const sample = {
  entries: [
    entry('v2', 'fine', 'I am fine'),
    entry('v1', 'hello', 'hello there'),
  ],
};

runExporterContract({
  name: 'AnkiExporter',
  makeExporter: () => new AnkiExporter(),
  sample,
});

describe('AnkiExporter format', () => {
  it('emits sorted `front<TAB>back<TAB>tags` rows', () => {
    const out = new AnkiExporter().export(sample);
    expect(out).toBe(
      'hello\thello there\ten learning\nfine\tI am fine\ten learning',
    );
  });

  it('flattens tabs/newlines in a context so records stay aligned', () => {
    const out = new AnkiExporter().export({
      entries: [entry('v1', 'x', 'a\tb\nc')],
    });
    expect(out).toBe('x\ta b c\ten learning');
  });

  it('leaves the back blank when no context was captured', () => {
    const out = new AnkiExporter().export({ entries: [entry('v1', 'x')] });
    expect(out).toBe('x\t\ten learning');
  });
});
