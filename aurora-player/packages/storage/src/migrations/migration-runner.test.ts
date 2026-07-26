import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Migration } from './migration-runner.js';
import { runMigrations } from './migration-runner.js';
import { LEARNING_MIGRATIONS, openLearningDatabase } from './learning-migrations.js';

describe('runMigrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('applies migrations in order and reports the resulting version', () => {
    const applied: number[] = [];
    const migrations: Migration[] = [
      { version: 2, up: () => applied.push(2) },
      { version: 1, up: () => applied.push(1) },
    ];
    expect(runMigrations(db, migrations)).toBe(2);
    expect(applied).toEqual([1, 2]); // sorted ascending regardless of input order
  });

  it('is idempotent: a second run applies nothing new', () => {
    let count = 0;
    const migrations: Migration[] = [{ version: 1, up: () => (count += 1) }];
    expect(runMigrations(db, migrations)).toBe(1);
    expect(runMigrations(db, migrations)).toBe(1);
    expect(count).toBe(1);
  });

  it('applies only migrations newer than the recorded version', () => {
    const applied: number[] = [];
    runMigrations(db, [{ version: 1, up: () => applied.push(1) }]);
    runMigrations(db, [
      { version: 1, up: () => applied.push(1) },
      { version: 2, up: () => applied.push(2) },
    ]);
    expect(applied).toEqual([1, 2]);
  });

  it('returns 0 for an empty migration list', () => {
    expect(runMigrations(db, [])).toBe(0);
  });
});

describe('openLearningDatabase', () => {
  it('creates the learning schema and is safe to reopen', () => {
    const db = openLearningDatabase();
    const names = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toContain('vocabulary');
    expect(names).toContain('review_cards');
    expect(names).toContain('ai_cache'); // v2
    expect(names).toContain('consent'); // v3
    // v4 adds tags/category columns to vocabulary (no new table).
    const vocabCols = (
      db.prepare('PRAGMA table_info(vocabulary)').all() as { name: string }[]
    ).map((c) => c.name);
    expect(vocabCols).toContain('tags');
    expect(vocabCols).toContain('category');
    // Re-running the same migrations against the same handle is a no-op.
    expect(runMigrations(db, LEARNING_MIGRATIONS)).toBe(4);
    db.close();
  });
});
