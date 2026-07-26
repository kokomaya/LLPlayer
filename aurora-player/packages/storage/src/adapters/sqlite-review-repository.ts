import type {
  ReviewCard,
  ReviewRepository,
  ReviewState,
} from '@aurora/domain';
import type Database from 'better-sqlite3';

interface ReviewRow {
  id: string;
  vocabId: string;
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: string;
  lastReviewedAt: number | null;
}

const toCard = (row: ReviewRow): ReviewCard => ({
  id: row.id,
  vocabId: row.vocabId,
  due: row.due,
  stability: row.stability,
  difficulty: row.difficulty,
  elapsedDays: row.elapsedDays,
  scheduledDays: row.scheduledDays,
  learningSteps: row.learningSteps,
  reps: row.reps,
  lapses: row.lapses,
  state: row.state as ReviewState,
  ...(row.lastReviewedAt !== null ? { lastReviewedAt: row.lastReviewedAt } : {}),
});

/**
 * better-sqlite3-backed {@link ReviewRepository}. Expects the `review_cards`
 * table from {@link LEARNING_MIGRATIONS}. `listDue` filters and orders in SQL
 * (indexed by `due`) but yields the same result as the in-memory adapter (LSP).
 */
export class SqliteReviewRepository implements ReviewRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(card: ReviewCard): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO review_cards
           (id, vocabId, due, stability, difficulty, elapsedDays, scheduledDays,
            learningSteps, reps, lapses, state, lastReviewedAt)
         VALUES
           (@id, @vocabId, @due, @stability, @difficulty, @elapsedDays,
            @scheduledDays, @learningSteps, @reps, @lapses, @state, @lastReviewedAt)
         ON CONFLICT(id) DO UPDATE SET
           vocabId = excluded.vocabId, due = excluded.due,
           stability = excluded.stability, difficulty = excluded.difficulty,
           elapsedDays = excluded.elapsedDays, scheduledDays = excluded.scheduledDays,
           learningSteps = excluded.learningSteps, reps = excluded.reps,
           lapses = excluded.lapses, state = excluded.state,
           lastReviewedAt = excluded.lastReviewedAt`,
      )
      .run({
        id: card.id,
        vocabId: card.vocabId,
        due: card.due,
        stability: card.stability,
        difficulty: card.difficulty,
        elapsedDays: card.elapsedDays,
        scheduledDays: card.scheduledDays,
        learningSteps: card.learningSteps,
        reps: card.reps,
        lapses: card.lapses,
        state: card.state,
        lastReviewedAt: card.lastReviewedAt ?? null,
      });
    return Promise.resolve();
  }

  get(id: string): Promise<ReviewCard | undefined> {
    const row = this.db
      .prepare('SELECT * FROM review_cards WHERE id = ?')
      .get(id) as ReviewRow | undefined;
    return Promise.resolve(row ? toCard(row) : undefined);
  }

  list(): Promise<readonly ReviewCard[]> {
    const rows = this.db
      .prepare('SELECT * FROM review_cards ORDER BY due, id')
      .all() as ReviewRow[];
    return Promise.resolve(rows.map(toCard));
  }

  listDue(now: number): Promise<readonly ReviewCard[]> {
    const rows = this.db
      .prepare('SELECT * FROM review_cards WHERE due <= ? ORDER BY due, id')
      .all(now) as ReviewRow[];
    return Promise.resolve(rows.map(toCard));
  }

  delete(id: string): Promise<void> {
    this.db.prepare('DELETE FROM review_cards WHERE id = ?').run(id);
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.db.prepare('DELETE FROM review_cards').run();
    return Promise.resolve();
  }
}
