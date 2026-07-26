/**
 * Result-cache port for the AI capability domain (plan/05 · ai "缓存"; storage
 * lists `CacheRepository`).
 *
 * Like the learning repositories, this abstraction lives in the KERNEL on
 * purpose. The `ai` package (use-cases that *consume* the cache to dedupe LLM
 * calls) and the `storage` package (adapters that *implement* it over memory /
 * SQLite) are both `layer:domain`, and a domain package may depend only on the
 * kernel — never on another domain package (plan/03 §3). Hosting the port here
 * lets both sides depend on this shared abstraction (DIP) without depending on
 * each other, exactly as `VocabularyRepository`/`ReviewRepository` do.
 */

/**
 * One cached value. Times are epoch milliseconds (`number`) — the same unit the
 * injected clock yields — so entries serialize verbatim and expiry stays
 * deterministic under a `ManualClock`. `expiresAt` absent means "never expires".
 */
export interface CacheEntry {
  readonly key: string;
  readonly value: string;
  readonly createdAt: number;
  readonly expiresAt?: number;
}

/**
 * A string-keyed, string-valued cache with optional per-entry TTL. Expiry is
 * evaluated against the caller-supplied `now` (epoch ms), never a wall clock, so
 * callers stay testable (plan/09 · determinism). A stale entry reads as a miss.
 */
export interface CacheRepository {
  /** The live value for `key`, or `undefined` if absent or expired at `now`. */
  get(key: string, now: number): Promise<string | undefined>;
  /**
   * Store `value` under `key`, stamped at `now`. When `ttlMs` is given the entry
   * expires at `now + ttlMs`; otherwise it never expires. Overwrites any
   * existing entry for `key`.
   */
  set(key: string, value: string, now: number, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
}
