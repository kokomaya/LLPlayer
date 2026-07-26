import {
  emptyConsent,
  isDataUse,
  withConsent,
  type ConsentRepository,
  type ConsentState,
  type DataUse,
} from '@aurora/domain';
import type Database from 'better-sqlite3';

interface ConsentRow {
  use: string;
  granted: number;
  at: number;
}

/**
 * better-sqlite3-backed {@link ConsentRepository}. Expects the `consent` table
 * created by {@link LEARNING_MIGRATIONS} (v3); open the DB with
 * {@link openLearningDatabase} and inject the handle so it shares one connection
 * with the other repositories. One row per {@link DataUse}; `granted` is stored
 * 0/1 and `at` is the injected epoch-ms timestamp (rule ①.C.13). An unknown
 * `use` value in a row is skipped defensively (forward-compatible schema).
 */
export class SqliteConsentRepository implements ConsentRepository {
  constructor(private readonly db: Database.Database) {}

  load(): Promise<ConsentState> {
    const rows = this.db
      .prepare('SELECT use, granted, at FROM consent')
      .all() as ConsentRow[];
    let state = emptyConsent();
    for (const row of rows) {
      if (isDataUse(row.use)) {
        state = withConsent(state, row.use, row.granted === 1, row.at);
      }
    }
    return Promise.resolve(state);
  }

  grant(use: DataUse, at: number): Promise<void> {
    return this.#write(use, true, at);
  }

  revoke(use: DataUse, at: number): Promise<void> {
    return this.#write(use, false, at);
  }

  clear(): Promise<void> {
    this.db.prepare('DELETE FROM consent').run();
    return Promise.resolve();
  }

  #write(use: DataUse, granted: boolean, at: number): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO consent (use, granted, at) VALUES (@use, @granted, @at)
         ON CONFLICT(use) DO UPDATE SET granted = excluded.granted, at = excluded.at`,
      )
      .run({ use, granted: granted ? 1 : 0, at });
    return Promise.resolve();
  }
}
