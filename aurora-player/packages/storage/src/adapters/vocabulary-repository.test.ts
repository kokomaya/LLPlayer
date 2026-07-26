import type Database from 'better-sqlite3';
import type { VocabularyRepository } from '@aurora/domain';
import { runVocabularyRepositoryContract } from '../contract/vocabulary-repository-contract.js';
import { openLearningDatabase } from '../migrations/learning-migrations.js';
import { InMemoryVocabularyRepository } from './in-memory-vocabulary-repository.js';
import { SqliteVocabularyRepository } from './sqlite-vocabulary-repository.js';

runVocabularyRepositoryContract({
  name: 'InMemoryVocabularyRepository',
  makeRepo: () => new InMemoryVocabularyRepository(),
});

const dbs = new WeakMap<VocabularyRepository, Database.Database>();

runVocabularyRepositoryContract({
  name: 'SqliteVocabularyRepository',
  makeRepo: () => {
    const db = openLearningDatabase();
    const repo = new SqliteVocabularyRepository(db);
    dbs.set(repo, db);
    return repo;
  },
  dispose: (repo) => dbs.get(repo)?.close(),
});
