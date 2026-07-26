import {
  emptyConsent,
  withConsent,
  type ConsentState,
  type DataUse,
} from '@aurora/domain';
import { describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for a consent policy (plan/09 §1 · contract tests;
 * plan/12 · legal). Any `isPermitted`/`missingConsent`-shaped pair must pass
 * this suite, so the privacy red line is a substitutable, verifiable transform
 * (LSP): pure input → boolean/array, no clock/network/I/O.
 */
export interface ConsentPolicyContractCase {
  readonly name: string;
  readonly isPermitted: (
    required: readonly DataUse[],
    state: ConsentState,
  ) => boolean;
  readonly missingConsent: (
    required: readonly DataUse[],
    state: ConsentState,
  ) => readonly DataUse[];
}

// A fixed injected timestamp — consent decisions carry no wall clock (①.C.13).
const AT = 1_700_000_000_000;

export const runConsentPolicyContract = (
  testCase: ConsentPolicyContractCase,
): void => {
  const { isPermitted, missingConsent } = testCase;

  const granted = (...uses: readonly DataUse[]): ConsentState =>
    uses.reduce<ConsentState>(
      (state, use) => withConsent(state, use, true, AT),
      emptyConsent(),
    );

  describe(`consent policy contract: ${testCase.name}`, () => {
    it('always permits a capability that requires no data use', () => {
      expect(isPermitted([], emptyConsent())).toBe(true);
      expect(isPermitted([], granted('network'))).toBe(true);
      expect(missingConsent([], emptyConsent())).toEqual([]);
    });

    it('denies a required use that has never been granted', () => {
      expect(isPermitted(['network'], emptyConsent())).toBe(false);
      expect(missingConsent(['network'], emptyConsent())).toEqual(['network']);
    });

    it('permits only when EVERY required use is granted', () => {
      const state = granted('network');
      expect(isPermitted(['network', 'third-party'], state)).toBe(false);
      expect(missingConsent(['network', 'third-party'], state)).toEqual([
        'third-party',
      ]);
      expect(isPermitted(['network'], state)).toBe(true);
    });

    it('permits once all required uses are granted', () => {
      const state = granted('network', 'third-party');
      expect(isPermitted(['network', 'third-party'], state)).toBe(true);
      expect(missingConsent(['network', 'third-party'], state)).toEqual([]);
    });

    it('denies again after a granted use is revoked', () => {
      const grantedState = granted('network');
      const revoked = withConsent(grantedState, 'network', false, AT + 1);
      expect(isPermitted(['network'], grantedState)).toBe(true);
      expect(isPermitted(['network'], revoked)).toBe(false);
      expect(missingConsent(['network'], revoked)).toEqual(['network']);
    });
  });
};
