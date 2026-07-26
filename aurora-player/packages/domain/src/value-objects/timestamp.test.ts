import { describe, expect, it } from 'vitest';
import { isErr, isOk } from '../result.js';
import { formatClock, parseClock } from './timestamp.js';

describe('parseClock', () => {
  it.each([
    ['00:00:01,000', 1000], // SRT comma
    ['00:00:01.000', 1000], // VTT dot
    ['01:02:03,500', 3723500], // hours
    ['02:03.250', 123250], // MM:SS.mmm (no hours, VTT)
    ['00:00:00,5', 500], // right-padded fraction
    ['00:00:00,05', 50],
  ])('parses %s -> %dms', (raw, expected) => {
    const r = parseClock(raw);
    expect(isOk(r)).toBe(true);
    if (isOk(r)) {
      expect(r.value).toBe(expected);
    }
  });

  it.each(['nonsense', '99:99:99', '', '1:2:3:4'])(
    'rejects invalid "%s"',
    (raw) => {
      expect(isErr(parseClock(raw))).toBe(true);
    },
  );
});

describe('formatClock', () => {
  it('formats with SRT comma by default', () => {
    expect(formatClock(3723500)).toBe('01:02:03,500');
  });

  it('formats with VTT dot when requested', () => {
    expect(formatClock(1000, '.')).toBe('00:00:01.000');
  });

  it('clamps negatives to zero and rounds', () => {
    expect(formatClock(-50)).toBe('00:00:00,000');
    expect(formatClock(1499.6)).toBe('00:00:01,500');
  });

  it('round-trips with parseClock', () => {
    const ms = 5_025_123;
    const r = parseClock(formatClock(ms));
    expect(isOk(r) && r.value).toBe(ms);
  });
});
