import { describe, expect, it } from 'vitest';
import { telemetryEvent } from './event.js';

const AT = 1_700_000_000_000;

describe('telemetryEvent', () => {
  it('builds a bare event with the injected timestamp and no props key', () => {
    const e = telemetryEvent('consent.granted', AT);
    expect(e).toEqual({ name: 'consent.granted', at: AT });
    expect('props' in e).toBe(false); // exactOptionalPropertyTypes: omitted, not undefined
  });

  it('preserves non-PII scalar props', () => {
    const e = telemetryEvent('consent.granted', AT, { count: 2, forced: false, kind: 'grant' });
    expect(e.props).toEqual({ count: 2, forced: false, kind: 'grant' });
  });

  it('rejects an empty / whitespace name', () => {
    expect(() => telemetryEvent('', AT)).toThrow(/non-empty/);
    expect(() => telemetryEvent('   ', AT)).toThrow(/non-empty/);
  });

  it('rejects non-scalar props to keep PII out of the pipeline', () => {
    // A nested object, an array, and null are all rejected — no identity payloads.
    expect(() => telemetryEvent('e', AT, { user: { id: 1 } as unknown as string })).toThrow(/scalar/);
    expect(() => telemetryEvent('e', AT, { tags: [1, 2] as unknown as number })).toThrow(/scalar/);
    expect(() => telemetryEvent('e', AT, { who: null as unknown as string })).toThrow(/scalar/);
  });
});
