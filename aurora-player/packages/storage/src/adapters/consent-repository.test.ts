import type Database from 'better-sqlite3';
import { openLearningDatabase } from '../migrations/learning-migrations.js';
import { runConsentRepositoryContract } from '../contract/consent-repository-contract.js';
import { InMemoryConsentRepository } from './in-memory-consent-repository.js';
import { SqliteConsentRepository } from './sqlite-consent-repository.js';

// Both adapters run the SAME contract — this is the LSP proof for the consent
// port (plan/09 §1), mirroring the cache/vocab/review repository suites.
runConsentRepositoryContract({
  name: 'InMemoryConsentRepository',
  makeRepo: () => new InMemoryConsentRepository(),
});

// Each Sqlite case gets a fresh :memory: DB migrated to the latest schema (v3).
const dbs = new WeakMap<SqliteConsentRepository, Database.Database>();
runConsentRepositoryContract({
  name: 'SqliteConsentRepository',
  makeRepo: () => {
    const db = openLearningDatabase();
    const repo = new SqliteConsentRepository(db);
    dbs.set(repo, db);
    return repo;
  },
  dispose: (repo) => dbs.get(repo as SqliteConsentRepository)?.close(),
});
