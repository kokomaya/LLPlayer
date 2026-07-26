import type { CacheRepository } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for {@link CacheRepository} implementations
 * (plan/09 §1). Running the identical suite against every adapter is how LSP
 * becomes verifiable: any adapter that passes substitutes for the port. Time is
 * an explicit `now` argument (fixed {@link T0} here) so TTL behaviour is
 * deterministic with no wall clock (plan/09 · determinism).
 */
export interface CacheRepositoryContractCase {
  readonly name: string;
  /** Fresh, empty repository per test. */
  readonly makeRepo: () => CacheRepository;
  /** Optional teardown (e.g. closing a DB handle). */
  readonly dispose?: (repo: CacheRepository) => void;
}

const T0 = 1_700_000_000_000;

export const runCacheRepositoryContract = (
  testCase: CacheRepositoryContractCase,
): void => {
  describe(`CacheRepository contract: ${testCase.name}`, () => {
    let repo: CacheRepository;

    beforeEach(() => {
      repo = testCase.makeRepo();
    });

    afterEach(() => {
      testCase.dispose?.(repo);
    });

    it('returns undefined for a missing key', async () => {
      expect(await repo.get('nope', T0)).toBeUndefined();
    });

    it('round-trips a value with no TTL (never expires)', async () => {
      await repo.set('k', 'v', T0);
      expect(await repo.get('k', T0)).toBe('v');
      // Far in the future: a non-expiring entry still resolves.
      expect(await repo.get('k', T0 + 10 * 365 * 24 * 3600_000)).toBe('v');
    });

    it('overwrites an existing key (latest write wins)', async () => {
      await repo.set('k', 'first', T0);
      await repo.set('k', 'second', T0);
      expect(await repo.get('k', T0)).toBe('second');
    });

    it('serves a value before its TTL elapses', async () => {
      await repo.set('k', 'v', T0, 1000);
      expect(await repo.get('k', T0 + 999)).toBe('v');
    });

    it('treats an entry at/after its TTL as a miss', async () => {
      await repo.set('k', 'v', T0, 1000);
      expect(await repo.get('k', T0 + 1000)).toBeUndefined();
      expect(await repo.get('k', T0 + 5000)).toBeUndefined();
    });

    it('re-setting a key refreshes its TTL', async () => {
      await repo.set('k', 'v', T0, 1000);
      await repo.set('k', 'v2', T0 + 2000, 1000); // past the old expiry
      expect(await repo.get('k', T0 + 2500)).toBe('v2');
    });

    it('deletes a key idempotently', async () => {
      await repo.set('k', 'v', T0);
      await repo.delete('k');
      expect(await repo.get('k', T0)).toBeUndefined();
      await repo.delete('k'); // no throw on a missing key
    });
  });
};
