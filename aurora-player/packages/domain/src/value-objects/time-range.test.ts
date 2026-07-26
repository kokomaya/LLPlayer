import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../result.js';
import {
  contains,
  createTimeRange,
  durationMs,
  overlaps,
} from './time-range.js';

describe('TimeRange', () => {
  it('creates a valid range', () => {
    const r = createTimeRange(1000, 5000);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(durationMs(r.value)).toBe(4000);
    }
  });

  it('allows a zero-length range', () => {
    expect(isOk(createTimeRange(10, 10))).toBe(true);
  });

  it.each([
    ['negative start', -1, 10],
    ['end before start', 10, 5],
    ['non-finite', Number.NaN, 5],
  ])('rejects %s', (_label, start, end) => {
    expect(isErr(createTimeRange(start, end))).toBe(true);
  });

  it('contains is inclusive on both ends', () => {
    const r = { startMs: 100, endMs: 200 };
    expect(contains(r, 100)).toBe(true);
    expect(contains(r, 200)).toBe(true);
    expect(contains(r, 150)).toBe(true);
    expect(contains(r, 99)).toBe(false);
    expect(contains(r, 201)).toBe(false);
  });

  it('overlaps detects touching and disjoint ranges', () => {
    expect(overlaps({ startMs: 0, endMs: 10 }, { startMs: 10, endMs: 20 })).toBe(
      true,
    );
    expect(overlaps({ startMs: 0, endMs: 10 }, { startMs: 11, endMs: 20 })).toBe(
      false,
    );
  });
});
