import {
  emptyConsent,
  withConsent,
  type ConsentState,
  type DataUse,
} from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { runConsentPolicyContract } from './contract/consent-contract.js';
import { isPermitted, missingConsent, ONLINE_DATA_USES } from './policy.js';

// The real policy must satisfy the reusable contract (LSP).
runConsentPolicyContract({ name: 'isPermitted/missingConsent', isPermitted, missingConsent });

const AT = 1_700_000_000_000;

describe('consent policy specifics', () => {
  it('gates a YouTube-shaped online capability on network + third-party', () => {
    // Mirrors youtube-importer.example.ts: besides the build-profile gate
    // (storeSafe:false), the runtime capability also needs consent.
    const required = ONLINE_DATA_USES;
    let state: ConsentState = emptyConsent();
    expect(isPermitted(required, state)).toBe(false);
    expect(missingConsent(required, state)).toEqual(['network', 'third-party']);

    state = withConsent(state, 'network', true, AT);
    expect(isPermitted(required, state)).toBe(false); // still missing third-party

    state = withConsent(state, 'third-party', true, AT);
    expect(isPermitted(required, state)).toBe(true);
  });

  it('de-duplicates repeated requirements in missingConsent', () => {
    const required: readonly DataUse[] = ['network', 'network', 'pii'];
    expect(missingConsent(required, emptyConsent())).toEqual(['network', 'pii']);
  });

  it('treats an explicitly revoked use as not permitted', () => {
    const state = withConsent(emptyConsent(), 'telemetry', false, AT);
    expect(isPermitted(['telemetry'], state)).toBe(false);
    expect(missingConsent(['telemetry'], state)).toEqual(['telemetry']);
  });
});
