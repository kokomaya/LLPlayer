import { describe, expect, it } from 'vitest';
import type { ConsentRecord } from '../privacy/consent.js';
import type { ReviewCard, VocabEntry } from '../learning/cards.js';
import type { LanguageCode } from '../value-objects/language-code.js';
import type { Lemma } from '../value-objects/lemma.js';
import { DATA_EXPORT_VERSION, dataExport } from './export.js';

const AT = 1_700_000_000_000;

const vocab: VocabEntry = {
  id: 'en:hello',
  lemma: 'hello' as Lemma,
  lang: 'en' as LanguageCode,
  status: 'learning',
  createdAt: AT,
};

const card: ReviewCard = {
  id: 'en:hello',
  vocabId: 'en:hello',
  due: AT,
  stability: 1,
  difficulty: 5,
  elapsedDays: 0,
  scheduledDays: 0,
  learningSteps: 0,
  reps: 0,
  lapses: 0,
  state: 'new',
};

const consent: ConsentRecord = { use: 'telemetry', granted: true, at: AT };

describe('dataExport', () => {
  it('stamps the current version and the injected exportedAt', () => {
    const snapshot = dataExport(AT + 7, { vocab: [], reviews: [], consent: [] });
    expect(snapshot.version).toBe(DATA_EXPORT_VERSION);
    expect(snapshot.exportedAt).toBe(AT + 7);
  });

  it('passes the user-data parts through unchanged', () => {
    const snapshot = dataExport(AT, {
      vocab: [vocab],
      reviews: [card],
      consent: [consent],
    });
    expect(snapshot.vocab).toEqual([vocab]);
    expect(snapshot.reviews).toEqual([card]);
    expect(snapshot.consent).toEqual([consent]);
  });

  it('carries only user-data keys (data minimization: no secrets field)', () => {
    const snapshot = dataExport(AT, { vocab: [], reviews: [], consent: [] });
    expect(Object.keys(snapshot).sort()).toEqual([
      'consent',
      'exportedAt',
      'reviews',
      'version',
      'vocab',
    ]);
  });

  it('produces a JSON-serializable snapshot', () => {
    const snapshot = dataExport(AT, {
      vocab: [vocab],
      reviews: [card],
      consent: [consent],
    });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
