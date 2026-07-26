import Database from 'better-sqlite3';
import type { Migration } from './migration-runner.js';
import { runMigrations } from './migration-runner.js';

/**
 * Schema for the learning loop's SQLite storage (plan/05 · storage). Column
 * names mirror the kernel {@link VocabEntry} / {@link ReviewCard} fields so the
 * repositories map rows one-to-one.
 */
export const LEARNING_MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS vocabulary (
        id TEXT PRIMARY KEY,
        lemma TEXT NOT NULL,
        lang TEXT NOT NULL,
        context TEXT,
        status TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )`);
      db.exec(`CREATE TABLE IF NOT EXISTS review_cards (
        id TEXT PRIMARY KEY,
        vocabId TEXT NOT NULL,
        due INTEGER NOT NULL,
        stability REAL NOT NULL,
        difficulty REAL NOT NULL,
        elapsedDays REAL NOT NULL,
        scheduledDays REAL NOT NULL,
        learningSteps INTEGER NOT NULL,
        reps INTEGER NOT NULL,
        lapses INTEGER NOT NULL,
        state TEXT NOT NULL,
        lastReviewedAt INTEGER
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_review_due ON review_cards(due)');
    },
  },
  {
    // v2 (plan/05 · ai "缓存"): AI result cache keyed by (providerId, kind,
    // promptHash). `expiresAt` NULL means the entry never expires.
    version: 2,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS ai_cache (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        expiresAt INTEGER
      )`);
    },
  },
  {
    // v3 (plan/12 · legal-privacy): user consent for data governance. One row per
    // DataUse; `granted` is 0/1 and `at` is the injected epoch-ms decision time.
    version: 3,
    up: (db) => {
      db.exec(`CREATE TABLE IF NOT EXISTS consent (
        use TEXT PRIMARY KEY,
        granted INTEGER NOT NULL,
        at INTEGER NOT NULL
      )`);
    },
  },
  {
    // v4 (learning · 生词分类): optional grouping metadata on vocabulary.
    // `tags` is a JSON-array string (NULL = untagged); `category` is a single
    // bucket (NULL = uncategorized). Additive columns — existing rows read NULL,
    // which the repository maps back to absent fields (OCP: old data unbroken).
    version: 4,
    up: (db) => {
      db.exec('ALTER TABLE vocabulary ADD COLUMN tags TEXT');
      db.exec('ALTER TABLE vocabulary ADD COLUMN category TEXT');
    },
  },
];

/**
 * Open a SQLite database for the learning loop and bring it up to the latest
 * schema. `:memory:` gives an ephemeral DB (tests); a path persists to disk.
 * The composition root shares the returned handle across both repositories.
 */
export const openLearningDatabase = (
  filename = ':memory:',
): Database.Database => {
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  runMigrations(db, LEARNING_MIGRATIONS);
  return db;
};
