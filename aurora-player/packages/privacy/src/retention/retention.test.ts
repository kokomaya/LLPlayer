import type { ReviewCard, VocabEntry } from '@aurora/domain';
import { runRetentionContract } from '../contract/retention-contract.js';
import type { RetentionRepositories } from './retention-service.js';

/**
 * Kernel-only proof of the retention capability. `@aurora/privacy` may not import
 * `@aurora/storage` (both are `layer:domain`, rule ①.A.2), so this drives the
 * contract over minimal Map-backed vocab + review repos that implement exactly
 * the ports {@link RetentionService} touches. The same contract runs against the
 * REAL in-memory and SQLite adapters from the `scope:tool` CLI (data.test.ts).
 */
const makeFakeRepos = (): RetentionRepositories => {
  const vocab = new Map<string, VocabEntry>();
  const reviews = new Map<string, ReviewCard>();
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
  };
};

runRetentionContract({
  name: 'RetentionService over kernel-only fakes',
  makeRepos: makeFakeRepos,
});
