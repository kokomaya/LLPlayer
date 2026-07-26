import type {
  ConsentRecord,
  ConsentState,
  DataUse,
  ReviewCard,
  VocabEntry,
} from '@aurora/domain';
import { runDataImportContract } from '../contract/import-contract.js';
import type { DataSubjectRepositories } from './data-subject-service.js';

/**
 * Kernel-only proof of the data-import capability. `@aurora/privacy` may not
 * import `@aurora/storage` (both are `layer:domain`, rule ①.A.2), so this drives
 * the contract over minimal Map-backed vocab + review + consent repos that
 * implement exactly the ports {@link DataSubjectService} touches. The same
 * contract runs against the REAL in-memory and SQLite adapters from the
 * `scope:tool` CLI (data.test.ts).
 */
const makeFakeRepos = (): DataSubjectRepositories => {
  const vocab = new Map<string, VocabEntry>();
  const reviews = new Map<string, ReviewCard>();
  const consent = new Map<DataUse, ConsentRecord>();
  return {
    vocab: {
      upsert: (e) => {
        vocab.set(e.id, e);
        return Promise.resolve();
      },
      get: (id) => Promise.resolve(vocab.get(id)),
      list: () => Promise.resolve([...vocab.values()]),
      delete: (id) => {
        vocab.delete(id);
        return Promise.resolve();
      },
      clear: () => {
        vocab.clear();
        return Promise.resolve();
      },
    },
    reviews: {
      upsert: (c) => {
        reviews.set(c.id, c);
        return Promise.resolve();
      },
      get: (id) => Promise.resolve(reviews.get(id)),
      list: () => Promise.resolve([...reviews.values()]),
      listDue: (now) =>
        Promise.resolve([...reviews.values()].filter((c) => c.due <= now)),
      delete: (id) => {
        reviews.delete(id);
        return Promise.resolve();
      },
      clear: () => {
        reviews.clear();
        return Promise.resolve();
      },
    },
    consent: {
      load: (): Promise<ConsentState> => Promise.resolve(new Map(consent)),
      grant: (use, at) => {
        consent.set(use, { use, granted: true, at });
        return Promise.resolve();
      },
      revoke: (use, at) => {
        consent.set(use, { use, granted: false, at });
        return Promise.resolve();
      },
      clear: () => {
        consent.clear();
        return Promise.resolve();
      },
    },
  };
};

runDataImportContract({
  name: 'DataSubjectService.import over kernel-only fakes',
  makeRepos: makeFakeRepos,
});
