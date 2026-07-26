import { describe, expect, it } from 'vitest';
import type { DistributionMeta } from '../plugin.js';
import type { DistributionProfile } from '../distribution/policy.js';

/**
 * Reusable behaviour spec for a build-profile policy (plan/09 §1 · contract
 * tests; plan/12 · legal). Any `isAllowedUnder`-shaped decision function must
 * pass this suite, so the store-exclusion rule (①.F.20) is a substitutable,
 * verifiable transform (LSP): pure input → boolean, no clock/platform/I/O.
 */
export interface DistributionPolicyContractCase {
  readonly name: string;
  readonly isAllowed: (
    meta: DistributionMeta | undefined,
    profile: DistributionProfile,
  ) => boolean;
}

const PLAY: DistributionProfile = { platform: 'play' };
const IOS: DistributionProfile = { platform: 'ios' };
const DESKTOP: DistributionProfile = { platform: 'desktop' };
const SIDELOAD: DistributionProfile = { platform: 'sideload' };

export const runDistributionPolicyContract = (
  testCase: DistributionPolicyContractCase,
): void => {
  const { isAllowed } = testCase;
  describe(`distribution policy contract: ${testCase.name}`, () => {
    it('allows a plugin with no metadata under every profile', () => {
      for (const p of [PLAY, IOS, DESKTOP, SIDELOAD]) {
        expect(isAllowed(undefined, p)).toBe(true);
      }
    });

    it('excludes storeSafe:false from store-constrained profiles only', () => {
      const meta: DistributionMeta = { storeSafe: false };
      expect(isAllowed(meta, PLAY)).toBe(false);
      expect(isAllowed(meta, IOS)).toBe(false);
      expect(isAllowed(meta, DESKTOP)).toBe(true);
      expect(isAllowed(meta, SIDELOAD)).toBe(true);
    });

    it('honours allowSideload as a store-safety escape hatch', () => {
      const meta: DistributionMeta = { storeSafe: false };
      expect(isAllowed(meta, { platform: 'play', allowSideload: true })).toBe(true);
    });

    it('restricts a platform-pinned plugin to its listed platforms', () => {
      const meta: DistributionMeta = { platforms: ['desktop'] };
      expect(isAllowed(meta, DESKTOP)).toBe(true);
      expect(isAllowed(meta, PLAY)).toBe(false);
      expect(isAllowed(meta, SIDELOAD)).toBe(false);
    });

    it('excludes when EITHER the platform list or store safety fails', () => {
      const meta: DistributionMeta = {
        storeSafe: false,
        platforms: ['desktop', 'sideload'],
      };
      expect(isAllowed(meta, DESKTOP)).toBe(true);
      expect(isAllowed(meta, SIDELOAD)).toBe(true);
      // Excluded from play twice over (not in list AND not store-safe).
      expect(isAllowed(meta, PLAY)).toBe(false);
    });
  });
};
