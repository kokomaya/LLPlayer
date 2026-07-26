import type {
  LanguageCode,
  Lemma,
  VocabEntry,
  VocabStatus,
  VocabularyRepository,
} from '@aurora/domain';
import type Database from 'better-sqlite3';

interface VocabRow {
  id: string;
  lemma: string;
  lang: string;
  context: string | null;
  status: string;
  createdAt: number;
  tags: string | null;
  category: string | null;
}

const toEntry = (row: VocabRow): VocabEntry => ({
  id: row.id,
  lemma: row.lemma as Lemma,
  lang: row.lang as LanguageCode,
  status: row.status as VocabStatus,
  createdAt: row.createdAt,
  ...(row.context !== null ? { context: row.context } : {}),
  // NULL columns (incl. rows written before the v4 migration) map back to absent
  // optional fields, so a bare entry round-trips byte-for-byte (exactOptional).
  ...(row.tags !== null ? { tags: JSON.parse(row.tags) as readonly string[] } : {}),
  ...(row.category !== null ? { category: row.category } : {}),
});

/**
 * better-sqlite3-backed {@link VocabularyRepository}. Expects the `vocabulary`
 * table created by {@link LEARNING_MIGRATIONS}; open the DB with
 * {@link openLearningDatabase} and inject the handle so several repositories can
 * share one connection.
 */
export class SqliteVocabularyRepository implements VocabularyRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(entry: VocabEntry): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO vocabulary (id, lemma, lang, context, status, createdAt, tags, category)
         VALUES (@id, @lemma, @lang, @context, @status, @createdAt, @tags, @category)
         ON CONFLICT(id) DO UPDATE SET
           lemma = excluded.lemma, lang = excluded.lang, context = excluded.context,
           status = excluded.status, createdAt = excluded.createdAt,
           tags = excluded.tags, category = excluded.category`,
      )
      .run({
        id: entry.id,
        lemma: entry.lemma,
        lang: entry.lang,
        context: entry.context ?? null,
        status: entry.status,
        createdAt: entry.createdAt,
        tags: entry.tags !== undefined ? JSON.stringify(entry.tags) : null,
        category: entry.category ?? null,
      });
    return Promise.resolve();
  }

  get(id: string): Promise<VocabEntry | undefined> {
    const row = this.db
      .prepare('SELECT * FROM vocabulary WHERE id = ?')
      .get(id) as VocabRow | undefined;
    return Promise.resolve(row ? toEntry(row) : undefined);
  }

  list(): Promise<readonly VocabEntry[]> {
    const rows = this.db
      .prepare('SELECT * FROM vocabulary ORDER BY createdAt, id')
      .all() as VocabRow[];
    return Promise.resolve(rows.map(toEntry));
  }

  delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM vocabulary WHERE id = ?').run(id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.db.prepare('DELETE FROM vocabulary').run();
    return Promise.resolve();
  }
}
