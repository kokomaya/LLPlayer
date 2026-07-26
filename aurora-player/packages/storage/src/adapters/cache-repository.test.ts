import type { CacheRepository } from '@aurora/domain';
import type Database from 'better-sqlite3';
import { runCacheRepositoryContract } from '../contract/cache-repository-contract.js';
import { openLearningDatabase } from '../migrations/learning-migrations.js';
import { InMemoryCacheRepository } from './in-memory-cache-repository.js';
import { SqliteCacheRepository } from './sqlite-cache-repository.js';

runCacheRepositoryContract({
  name: 'InMemoryCacheRepository',
  makeRepo: () => new InMemoryCacheRepository(),
});

const dbs = new WeakMap<CacheRepository, Database.Database>();

runCacheRepositoryContract({
  name: 'SqliteCacheRepository',
  makeRepo: () => {
    const db = openLearningDatabase();
    const repo = new SqliteCacheRepository(db);
    dbs.set(repo, db);
    return repo;
  },
  dispose: (repo) => dbs.get(repo)?.close(),
});
