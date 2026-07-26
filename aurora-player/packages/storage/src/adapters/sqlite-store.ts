import Database from 'better-sqlite3';
import type { KeyValueStore } from '../port.js';

/**
 * better-sqlite3-backed {@link KeyValueStore} adapter — the desktop/Node
 * implementation. better-sqlite3 is a Node-native infrastructure dependency
 * (not a UI-platform library), so it is allowed inside the core, which is
 * spec'd to run and be unit-tested under plain Node (plan/04 · DIP note).
 *
 * The underlying API is synchronous; each method wraps its result in a resolved
 * promise to honour the async {@link KeyValueStore} contract (LSP).
 */
export class SqliteKeyValueStore implements KeyValueStore {
  readonly #db: Database.Database;

  /**
   * @param filename SQLite file path, or `:memory:` for an ephemeral DB.
   * @param table Table name (defaults to `kv`).
   */
  constructor(
    filename = ':memory:',
    private readonly table = 'kv',
  ) {
    this.#db = new Database(filename);
    this.#db.pragma('journal_mode = WAL');
    this.#db.exec(
      `CREATE TABLE IF NOT EXISTS ${this.table} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    );
  }

  get(key: string): Promise<string | undefined> {
    const row = this.#db
      .prepare(`SELECT value FROM ${this.table} WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    return Promise.resolve(row?.value);
  }

  set(key: string, value: string): Promise<void> {
    this.#db
      .prepare(
        `INSERT INTO ${this.table} (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
    return Promise.resolve();
  }

  has(key: string): Promise<boolean> {
    const row = this.#db
      .prepare(`SELECT 1 FROM ${this.table} WHERE key = ?`)
      .get(key);
    return Promise.resolve(row !== undefined);
  }

  delete(key: string): Promise<void> {
    this.#db.prepare(`DELETE FROM ${this.table} WHERE key = ?`).run(key);
    return Promise.resolve();
  }

  keys(): Promise<readonly string[]> {
    const rows = this.#db
      .prepare(`SELECT key FROM ${this.table}`)
      .all() as Array<{ key: string }>;
    return Promise.resolve(rows.map((r) => r.key));
  }

  clear(): Promise<void> {
    this.#db.exec(`DELETE FROM ${this.table}`);
    return Promise.resolve();
  }

  /** Releases the underlying database handle. */
  close(): void {
    this.#db.close();
  }
}
