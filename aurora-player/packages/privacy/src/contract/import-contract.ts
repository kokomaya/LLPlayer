import type {
  LanguageCode,
  Lemma,
  ReviewCard,
  VocabEntry,
} from '@aurora/domain';
import { dataExport, DATA_EXPORT_VERSION } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DataSubjectService,
  type DataSubjectRepositories,
} from '../dsar/data-subject-service.js';

/**
 * Reusable behaviour spec for data portability · import (plan/09 §1 · contract
 * tests; plan/12 · legal-privacy: GDPR Art.20). Any set of repositories — the
 * kernel-only fakes here, the real in-memory and SQLite adapters at the
 * composition root — yields the same import behaviour when driven through
 * {@link DataSubjectService.import}, so re-importing a snapshot is a
 * substitutable, verifiable capability (LSP).
 *
 * The case supplies a `makeRepos` factory (and optional `dispose`) so the suite
 * stays kernel-only: `@aurora/privacy` may not import `@aurora/storage` (both are
 * `layer:domain`, rule ①.A.2); the real adapters run from a `scope:tool` consumer
 * that may depend on both.
 */
export interface DataImportContractCase {
  readonly name: string;
  readonly makeRepos: () => DataSubjectRepositories;
  readonly dispose?: (repos: DataSubjectRepositories) => void;
}

// A fixed injected timestamp — import writes the snapshot's own stamps back
// verbatim and mints no wall clock (rule ①.C.13).
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

export const runDataImportContract = (
  testCase: DataImportContractCase,
): void => {
  describe(`DataSubjectService.import contract: ${testCase.name}`, () => {
    let repos: DataSubjectRepositories;
    let service: DataSubjectService;

    beforeEach(() => {
      repos = testCase.makeRepos();
      service = new DataSubjectService(repos);
    });

    afterEach(() => {
      testCase.dispose?.(repos);
    });

    it('imports an empty snapshot: report all zero, store stays empty', async () => {
      const report = await service.import(
        dataExport(AT, { vocab: [], reviews: [], consent: [] }),
      );
      expect(report).toEqual({
        version: DATA_EXPORT_VERSION,
        importedVocab: 0,
        importedReviews: 0,
        importedConsent: 0,
        replaced: false,
      });
      expect(await service.export(AT)).toEqual({
        version: DATA_EXPORT_VERSION,
        exportedAt: AT,
        vocab: [],
        reviews: [],
        consent: [],
      });
    });

    it('imports data, then export round-trips to the same snapshot', async () => {
      const snap = dataExport(AT, {
        vocab: [vocab()],
        reviews: [card()],
        consent: [{ use: 'telemetry', granted: true, at: AT }],
      });

      const report = await service.import(snap);
      expect(report.importedVocab).toBe(1);
      expect(report.importedReviews).toBe(1);
      expect(report.importedConsent).toBe(1);
      expect(report.replaced).toBe(false);

      const round = await service.export(AT);
      expect(round.vocab).toEqual(snap.vocab);
      expect(round.reviews).toEqual(snap.reviews);
      expect(round.consent).toEqual(snap.consent);
    });

    it('round-trips a tagged/categorized entry through import→export', async () => {
      const snap = dataExport(AT, {
        vocab: [vocab({ tags: ['deck-1', 'topic:greetings'], category: 'phrases' })],
        reviews: [],
        consent: [],
      });

      await service.import(snap);

      // Data minimization stays intact and the new optional fields survive the
      // export→import→export cycle byte-for-byte (rule ①.F.24/26).
      expect((await service.export(AT)).vocab).toEqual(snap.vocab);
    });

    it('is idempotent: importing the same snapshot twice yields the same store', async () => {
      const snap = dataExport(AT, {
        vocab: [vocab()],
        reviews: [card()],
        consent: [{ use: 'telemetry', granted: true, at: AT }],
      });

      await service.import(snap);
      await service.import(snap);

      const round = await service.export(AT);
      expect(round.vocab).toEqual(snap.vocab);
      expect(round.reviews).toEqual(snap.reviews);
      expect(round.consent).toEqual(snap.consent);
    });

    it('restores a revoked consent record faithfully (round-trip)', async () => {
      const snap = dataExport(AT, {
        vocab: [],
        reviews: [],
        consent: [{ use: 'network', granted: false, at: AT }],
      });

      await service.import(snap);

      expect((await service.export(AT)).consent).toEqual([
        { use: 'network', granted: false, at: AT },
      ]);
    });

    it('rejects a snapshot with an unsupported version', async () => {
      const bad = {
        ...dataExport(AT, { vocab: [], reviews: [], consent: [] }),
        version: DATA_EXPORT_VERSION + 1,
      };
      await expect(service.import(bad)).rejects.toThrow(/version/);
    });

    it('merge (default) keeps pre-existing data not in the snapshot', async () => {
      await repos.vocab.upsert(vocab({ id: 'kept' }));

      await service.import(
        dataExport(AT, {
          vocab: [vocab({ id: 'imported' })],
          reviews: [],
          consent: [],
        }),
      );

      expect((await service.export(AT)).vocab.map((v) => v.id).sort()).toEqual([
        'imported',
        'kept',
      ]);
    });

    it('replace mode erases pre-existing data before writing the snapshot', async () => {
      await repos.vocab.upsert(vocab({ id: 'stale' }));

      const report = await service.import(
        dataExport(AT, {
          vocab: [vocab({ id: 'fresh' })],
          reviews: [],
          consent: [],
        }),
        { replace: true },
      );

      expect(report.replaced).toBe(true);
      expect((await service.export(AT)).vocab.map((v) => v.id)).toEqual([
        'fresh',
      ]);
    });
  });
};
