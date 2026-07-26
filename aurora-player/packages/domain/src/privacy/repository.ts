import type { ConsentState, DataUse } from './consent.js';

/**
 * Persistence port for the user's consent (plan/12 · legal-privacy; DIP).
 *
 * Like {@link VocabularyRepository} and {@link CacheRepository}, this abstraction
 * lives in the KERNEL so both the consumers (the composition roots / CLI that
 * gate on consent via `@aurora/privacy`) and the adapters (`@aurora/storage`,
 * in-memory & SQLite) can depend on it without depending on each other — a
 * domain package may depend only on the kernel (plan/03 §3).
 *
 * `at` is an injected epoch-ms timestamp (never `Date.now()`), so a stored
 * decision's time is deterministic under a `ManualClock` (rule ①.C.13). Concrete
 * adapters and their shared LSP contract live in `@aurora/storage`.
 */
export interface ConsentRepository {
  /** The full current consent state. Empty when nothing has been decided. */
  load(): Promise<ConsentState>;
  /** Record that `use` is granted, stamped at `at`. Overwrites any prior record. */
  grant(use: DataUse, at: number): Promise<void>;
  /** Record that `use` is revoked, stamped at `at`. Overwrites any prior record. */
  revoke(use: DataUse, at: number): Promise<void>;
  /**
   * Forget every consent decision, returning to the empty state (right to
   * erasure, plan/12 · legal-privacy). Idempotent. Distinct from revoking all
   * uses: this removes the records entirely rather than storing `granted=false`,
   * so a data-subject erase leaves no consent trail behind.
   */
  clear(): Promise<void>;
}
