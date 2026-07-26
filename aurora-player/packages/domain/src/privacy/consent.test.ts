import { describe, expect, it } from 'vitest';
import {
  DATA_USES,
  emptyConsent,
  isDataUse,
  isGranted,
  withConsent,
} from './consent.js';

const AT = 1_700_000_000_000;

describe('consent value model', () => {
  it('starts empty: no use is granted', () => {
    const state = emptyConsent();
    for (const use of DATA_USES) {
      expect(isGranted(state, use)).toBe(false);
    }
  });

  it('withConsent is pure and records the injected timestamp', () => {
    const before = emptyConsent();
    const after = withConsent(before, 'network', true, AT);
    expect(isGranted(before, 'network')).toBe(false); // input untouched
    expect(isGranted(after, 'network')).toBe(true);
    expect(after.get('network')).toEqual({ use: 'network', granted: true, at: AT });
  });

  it('latest decision for a use wins (grant then revoke)', () => {
    const granted = withConsent(emptyConsent(), 'pii', true, AT);
    const revoked = withConsent(granted, 'pii', false, AT + 1);
    expect(isGranted(revoked, 'pii')).toBe(false);
    expect(revoked.get('pii')?.at).toBe(AT + 1);
  });

  it('isDataUse narrows only known categories', () => {
    expect(isDataUse('network')).toBe(true);
    expect(isDataUse('telemetry')).toBe(true);
    expect(isDataUse('bogus')).toBe(false);
    expect(isDataUse('')).toBe(false);
  });
});
