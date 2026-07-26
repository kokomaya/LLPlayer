import type Database from 'better-sqlite3';

/**
 * One ordered, forward-only schema change (plan/07 · M3 "migration framework").
 * `version` is a positive integer; migrations apply in ascending order and each
 * runs at most once.
 */
export interface Migration {
  readonly version: number;
  readonly up: (db: Database.Database) => void;
}

/**
 * Minimal versioned migration runner. Records applied versions in a
 * `schema_version` table and, in a single transaction, applies every migration
 * whose version exceeds the current max. Idempotent: re-running with the same
 * list is a no-op. Returns the resulting schema version.
 */
export const runMigrations = (
  db: Database.Database,
  migrations: readonly Migration[],
): number => {
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)',
  );
  const row = db
    .prepare('SELECT MAX(version) AS v FROM schema_version')
    .get() as { v: number | null };
  const current = row.v ?? 0;

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const record = db.prepare('INSERT INTO schema_version (version) VALUES (?)');
  db.transaction(() => {
    for (const migration of ordered) {
      if (migration.version > current) {
        migration.up(db);
        record.run(migration.version);
      }
    }
  })();

  const target = ordered.at(-1)?.version ?? 0;
  return Math.max(current, target);
};
