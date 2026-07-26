import type { CacheRepository } from '@aurora/domain';
import type Database from 'better-sqlite3';

interface CacheRow {
  value: string;
}

/**
 * better-sqlite3-backed {@link CacheRepository}. Expects the `ai_cache` table
 * created by {@link LEARNING_MIGRATIONS} (v2); open the DB with
 * {@link openLearningDatabase} and inject the handle so it shares one connection
 * with the learning repositories. Expiry is enforced in the SELECT against the
 * caller's `now`, so a stale row simply does not match (read as a miss).
 */
export class SqliteCacheRepository implements CacheRepository {
  constructor(private readonly db: Database.Database) {}

  get(key: string, now: number): Promise<string | undefined> {
    const row = this.db
      .prepare(
        `SELECT value FROM ai_cache
         WHERE key = ? AND (expiresAt IS NULL OR expiresAt > ?)`,
      )
      .get(key, now) as CacheRow | undefined;
    return Promise.resolve(row?.value);
  }

  set(key: string, value: string, now: number, ttlMs?: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO ai_cache (key, value, createdAt, expiresAt)
         VALUES (@key, @value, @createdAt, @expiresAt)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, createdAt = excluded.createdAt,
           expiresAt = excluded.expiresAt`,
      )
      .run({
        key,
        value,
        createdAt: now,
        expiresAt: ttlMs !== undefined ? now + ttlMs : null,
      });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.db.prepare('DELETE FROM ai_cache WHERE key = ?').run(key);
    return Promise.resolve();
  }
}
