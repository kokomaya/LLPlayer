import { isGranted, type ConsentRepository } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for {@link ConsentRepository} implementations
 * (plan/09 §1). Running the identical suite against every adapter is how LSP
 * becomes verifiable: any adapter that passes substitutes for the port. `at` is
 * an explicit injected timestamp (fixed {@link T0} here) so stored decisions are
 * deterministic with no wall clock (plan/09 · determinism, rule ①.C.13).
 */
export interface ConsentRepositoryContractCase {
  readonly name: string;
  /** Fresh, empty repository per test. */
  readonly makeRepo: () => ConsentRepository;
  /** Optional teardown (e.g. closing a DB handle). */
  readonly dispose?: (repo: ConsentRepository) => void;
}

const T0 = 1_700_000_000_000;

export const runConsentRepositoryContract = (
  testCase: ConsentRepositoryContractCase,
): void => {
  describe(`ConsentRepository contract: ${testCase.name}`, () => {
    let repo: ConsentRepository;

    beforeEach(() => {
      repo = testCase.makeRepo();
    });

    afterEach(() => {
      testCase.dispose?.(repo);
    });

    it('starts empty: nothing is granted', async () => {
      const state = await repo.load();
      expect(isGranted(state, 'network')).toBe(false);
      expect(isGranted(state, 'telemetry')).toBe(false);
    });

    it('grants a use and reads it back', async () => {
      await repo.grant('network', T0);
      expect(isGranted(await repo.load(), 'network')).toBe(true);
    });

    it('revokes a previously granted use', async () => {
      await repo.grant('network', T0);
      await repo.revoke('network', T0 + 1);
      expect(isGranted(await repo.load(), 'network')).toBe(false);
    });

    it('tracks each data use independently', async () => {
      await repo.grant('network', T0);
      const state = await repo.load();
      expect(isGranted(state, 'network')).toBe(true);
      expect(isGranted(state, 'third-party')).toBe(false);
    });

    it('is idempotent: re-granting keeps it granted', async () => {
      await repo.grant('pii', T0);
      await repo.grant('pii', T0 + 5);
      expect(isGranted(await repo.load(), 'pii')).toBe(true);
    });

    it('records the injected timestamp on the decision', async () => {
      await repo.grant('telemetry', T0 + 42);
      const record = (await repo.load()).get('telemetry');
      expect(record).toEqual({ use: 'telemetry', granted: true, at: T0 + 42 });
    });

    it('clears every decision idempotently, leaving no trail (right to erasure)', async () => {
      await repo.grant('network', T0);
      await repo.revoke('telemetry', T0 + 1);
      await repo.clear();
      const state = await repo.load();
      // Records are removed entirely, not just set to granted=false: absence.
      expect(state.size).toBe(0);
      expect(isGranted(state, 'network')).toBe(false);
      await repo.clear(); // no throw on an already-empty repository
      expect((await repo.load()).size).toBe(0);
    });
  });
};
