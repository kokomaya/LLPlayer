import type { ReviewCard, VocabEntry } from './cards.js';

/**
 * Persistence ports for the learning loop (plan/05 · storage/learning).
 *
 * These abstractions live in the KERNEL on purpose. Both the `learning` package
 * (use-cases that *consume* them) and the `storage` package (adapters that
 * *implement* them) are `layer:domain`, and a domain package may depend only on
 * the kernel — never on another domain package (plan/03 §3). Hosting the port
 * over kernel value types here lets both sides depend on this shared abstraction
 * (DIP) without depending on each other, exactly as the shared value types do.
 * Concrete adapters (in-memory, SQLite) and their LSP contract live in
 * `@aurora/storage`.
 */
export interface VocabularyRepository {
  upsert(entry: VocabEntry): Promise<void>;
  get(id: string): Promise<VocabEntry | undefined>;
  list(): Promise<readonly VocabEntry[]>;
  delete(id: string): Promise<void>;
  /**
   * Remove every entry (the user's right to erasure, plan/12 · legal-privacy).
   * Idempotent: clearing an empty repository is a no-op. Powers a data-subject
   * "delete all my data" operation without deleting ids one at a time.
   */
  clear(): Promise<void>;
}

export interface ReviewRepository {
  upsert(card: ReviewCard): Promise<void>;
  get(id: string): Promise<ReviewCard | undefined>;
  list(): Promise<readonly ReviewCard[]>;
  /** Cards whose `due <= now`, ascending by `due` (ties broken by `id`). */
  listDue(now: number): Promise<readonly ReviewCard[]>;
  delete(id: string): Promise<void>;
  /** Remove every card (right to erasure, plan/12). Idempotent. */
  clear(): Promise<void>;
}
