import {
  emptyConsent,
  withConsent,
  type ConsentState,
  type ReviewCard,
  type VocabEntry,
} from '@aurora/domain';
import { runDataSubjectContract } from '../contract/data-subject-contract.js';
import type { DataSubjectRepositories } from './data-subject-service.js';

/**
 * Kernel-only fake repositories for the data-subject contract. `@aurora/privacy`
 * may not import `@aurora/storage` (both are `layer:domain`, rule ①.A.2), so the
 * service's own tests build the ports from kernel primitives. The real in-memory
 * and SQLite adapters are proven against the same contract from `@aurora/cli`
 * (a `scope:tool` consumer) and against the storage repository contracts.
 */
const makeFakeRepos = (): DataSubjectRepositories => {
  const vocab = new Map<string, VocabEntry>();
  const reviews = new Map<string, ReviewCard>();
  let consent: ConsentState = emptyConsent();
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
      load: () => Promise.resolve(consent),
      grant: (use, at) => {
        consent = withConsent(consent, use, true, at);
        return Promise.resolve();
      },
      revoke: (use, at) => {
        consent = withConsent(consent, use, false, at);
        return Promise.resolve();
      },
      clear: () => {
        consent = emptyConsent();
        return Promise.resolve();
      },
    },
  };
};

runDataSubjectContract({
  name: 'DataSubjectService over kernel-only fakes',
  makeRepos: makeFakeRepos,
});
