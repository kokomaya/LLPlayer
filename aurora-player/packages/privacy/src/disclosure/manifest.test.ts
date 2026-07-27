import { DATA_USES, isDataUse } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { TELEMETRY_DATA_USES } from '../telemetry/consent-gated-telemetry.js';
import { ONLINE_DATA_USES } from '../policy.js';
import { DEFAULT_PROCESSING_MANIFEST } from './default-manifest.js';
import {
  disclosedUses,
  disclosureFor,
  isFullyDisclosed,
  missingDisclosures,
  undisclosedUses,
  type ProcessingManifest,
} from './manifest.js';

/**
 * Disclosure predicates (plan/12 · Art.13/14/30). The predicates are tested on a
 * tiny fixture; the DEFAULT manifest is then held to a self-consistency
 * invariant — the "purpose limitation" red line: every data use a runtime gate
 * can require must be disclosed, and each record carries only clean metadata.
 */
const fixture: ProcessingManifest = [
  { capability: 'a', uses: ['network'], purpose: 'A' },
  { capability: 'b', uses: ['network', 'third-party'], purpose: 'B', retentionDays: 7 },
];

describe('disclosure predicates', () => {
  it('disclosureFor finds a record or returns undefined', () => {
    expect(disclosureFor(fixture, 'b')?.retentionDays).toBe(7);
    expect(disclosureFor(fixture, 'missing')).toBeUndefined();
  });

  it('disclosedUses lists distinct uses in canonical order', () => {
    expect(disclosedUses(fixture)).toEqual(['network', 'third-party']);
  });

  it('undisclosedUses returns required uses declared nowhere (deduped, ordered)', () => {
    expect(undisclosedUses(fixture, ['network', 'pii', 'pii', 'telemetry'])).toEqual([
      'pii',
      'telemetry',
    ]);
    expect(undisclosedUses(fixture, ['network', 'third-party'])).toEqual([]);
  });

  it('isFullyDisclosed reflects whether every required use is declared', () => {
    expect(isFullyDisclosed(fixture, ['network'])).toBe(true);
    expect(isFullyDisclosed(fixture, ['network', 'telemetry'])).toBe(false);
    expect(isFullyDisclosed(fixture, [])).toBe(true); // nothing required ⇒ trivially disclosed
  });

  it('missingDisclosures reports taxonomy uses the manifest is silent about', () => {
    // fixture never declares pii or telemetry.
    expect(missingDisclosures(fixture)).toEqual(['pii', 'telemetry']);
  });
});

describe('DEFAULT_PROCESSING_MANIFEST self-consistency (purpose limitation)', () => {
  it('discloses every data use a runtime gate can require', () => {
    const gateRequired = [...ONLINE_DATA_USES, ...TELEMETRY_DATA_USES];
    expect(undisclosedUses(DEFAULT_PROCESSING_MANIFEST, gateRequired)).toEqual([]);
    expect(isFullyDisclosed(DEFAULT_PROCESSING_MANIFEST, gateRequired)).toBe(true);
  });

  it('only leaves ungated taxonomy uses undisclosed', () => {
    // The app gates network/third-party/telemetry; it does not process pii, so
    // pii is the one category legitimately left undisclosed.
    expect(missingDisclosures(DEFAULT_PROCESSING_MANIFEST)).toEqual(['pii']);
  });

  it('every record carries clean, valid metadata only', () => {
    const seen = new Set<string>();
    for (const record of DEFAULT_PROCESSING_MANIFEST) {
      expect(record.capability.trim()).not.toBe('');
      expect(seen.has(record.capability)).toBe(false); // no duplicate capabilities
      seen.add(record.capability);
      expect(record.purpose.trim()).not.toBe('');
      expect(record.uses.length).toBeGreaterThan(0);
      for (const use of record.uses) expect(isDataUse(use)).toBe(true);
      if (record.retentionDays !== undefined) {
        expect(record.retentionDays).toBeGreaterThan(0);
      }
    }
  });

  it('declares only known taxonomy categories (no stray uses)', () => {
    for (const use of disclosedUses(DEFAULT_PROCESSING_MANIFEST)) {
      expect(DATA_USES).toContain(use);
    }
  });
});
