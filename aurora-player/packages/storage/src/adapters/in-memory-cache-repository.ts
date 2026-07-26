import type { CacheEntry, CacheRepository } from '@aurora/domain';

/**
 * In-memory {@link CacheRepository} — the reference implementation and the
 * default for tests/ephemeral use. Expiry is evaluated against the caller's
 * `now`; a stale entry is pruned on read and reported as a miss.
 */
export class InMemoryCacheRepository implements CacheRepository {
  readonly #map = new Map<string, CacheEntry>();

  get(key: string, now: number): Promise<string | undefined> {
    const entry = this.#map.get(key);
    if (entry === undefined) {
      return Promise.resolve(undefined);
    }
    if (entry.expiresAt !== undefined && entry.expiresAt <= now) {
      this.#map.delete(key);
      return Promise.resolve(undefined);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, now: number, ttlMs?: number): Promise<void> {
    this.#map.set(key, {
      key,
      value,
      createdAt: now,
      ...(ttlMs !== undefined ? { expiresAt: now + ttlMs } : {}),
    });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.#map.delete(key);
    return Promise.resolve();
  }
}
