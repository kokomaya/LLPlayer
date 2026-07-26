import type Database from 'better-sqlite3';
import type { ReviewRepository } from '@aurora/domain';
import { runReviewRepositoryContract } from '../contract/review-repository-contract.js';
import { openLearningDatabase } from '../migrations/learning-migrations.js';
import { InMemoryReviewRepository } from './in-memory-review-repository.js';
import { SqliteReviewRepository } from './sqlite-review-repository.js';

runReviewRepositoryContract({
  name: 'InMemoryReviewRepository',
  makeRepo: () => new InMemoryReviewRepository(),
});

const dbs = new WeakMap<ReviewRepository, Database.Database>();

runReviewRepositoryContract({
  name: 'SqliteReviewRepository',
  makeRepo: () => {
    const db = openLearningDatabase();
    const repo = new SqliteReviewRepository(db);
    dbs.set(repo, db);
    return repo;
  },
  dispose: (repo) => dbs.get(repo)?.close(),
});
