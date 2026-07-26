import type {
  LanguageCode,
  Lemma,
  ReviewCard,
  VocabEntry,
} from '@aurora/domain';
import { DATA_EXPORT_VERSION } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DataSubjectService,
  type DataSubjectRepositories,
} from '../dsar/data-subject-service.js';

/**
 * Reusable behaviour spec for data-subject rights (plan/09 §1 · contract tests;
 * plan/12 · legal-privacy: access / portability / erasure). Any set of
 * repositories — the kernel-only fakes here, the real in-memory and SQLite
 * adapters at the composition root — yields the same export/erase behaviour when
 * driven through {@link DataSubjectService}, so the data-subject red line is a
 * substitutable, verifiable capability (LSP).
 *
 * The case supplies a `makeRepos` factory (and optional `dispose`) so the suite
 * stays kernel-only: `@aurora/privacy` may not import `@aurora/storage` (both are
 * `layer:domain`, rule ①.A.2), and the real adapters are exercised from a
 * `scope:tool` consumer that may depend on both.
 */
export interface DataSubjectContractCase {
  readonly name: string;
  readonly makeRepos: () => DataSubjectRepositories;
  readonly dispose?: (repos: DataSubjectRepositories) => void;
}

// A fixed injected timestamp — the export carries no wall clock (rule ①.C.13).
const AT = 1_700_000_000_000;

const vocab = (over: Partial<VocabEntry> = {}): VocabEntry => ({
  id: 'en:hello',
  lemma: 'hello' as Lemma,
  lang: 'en' as LanguageCode,
  status: 'learning',
  createdAt: AT,
  ...over,
});

const card = (over: Partial<ReviewCard> = {}): ReviewCard => ({
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
  ...over,
});

export const runDataSubjectContract = (
  testCase: DataSubjectContractCase,
): void => {
  describe(`DataSubjectService contract: ${testCase.name}`, () => {
    let repos: DataSubjectRepositories;
    let service: DataSubjectService;

    beforeEach(() => {
      repos = testCase.makeRepos();
      service = new DataSubjectService(repos);
    });

    afterEach(() => {
      testCase.dispose?.(repos);
    });

    it('exports an empty snapshot when nothing is stored', async () => {
      const snapshot = await service.export(AT);
      expect(snapshot).toEqual({
        version: DATA_EXPORT_VERSION,
        exportedAt: AT,
        vocab: [],
        reviews: [],
        consent: [],
      });
    });

    it('exports all of the user vocab, reviews, and consent', async () => {
      await repos.vocab.upsert(vocab({ id: 'en:hello' }));
      await repos.vocab.upsert(vocab({ id: 'en:world', lemma: 'world' as Lemma }));
      await repos.reviews.upsert(card({ id: 'en:hello' }));
      await repos.consent.grant('telemetry', AT);

      const snapshot = await service.export(AT);
      expect(snapshot.vocab.map((e) => e.id).sort()).toEqual([
        'en:hello',
        'en:world',
      ]);
      expect(snapshot.reviews.map((c) => c.id)).toEqual(['en:hello']);
      expect(snapshot.consent).toEqual([
        { use: 'telemetry', granted: true, at: AT },
      ]);
    });

    it('stamps exportedAt from the injected argument (determinism)', async () => {
      expect((await service.export(AT + 99)).exportedAt).toBe(AT + 99);
    });

    it('exports only user-data keys — no secrets/credentials field', async () => {
      await repos.vocab.upsert(vocab());
      expect(Object.keys(await service.export(AT)).sort()).toEqual([
        'consent',
        'exportedAt',
        'reviews',
        'version',
        'vocab',
      ]);
    });

    it('erases every repository, then re-exports empty (right to erasure)', async () => {
      await repos.vocab.upsert(vocab());
      await repos.reviews.upsert(card());
      await repos.consent.grant('network', AT);

      await service.erase();

      const snapshot = await service.export(AT);
      expect(snapshot.vocab).toEqual([]);
      expect(snapshot.reviews).toEqual([]);
      expect(snapshot.consent).toEqual([]);
    });

    it('erase is idempotent on an already-empty store', async () => {
      await service.erase();
      await service.erase();
      expect((await service.export(AT)).vocab).toEqual([]);
    });
  });
};
