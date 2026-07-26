import { describe, expect, it } from 'vitest';
import { locateByStart } from './binary-search.js';
import type { TimedLine } from './model.js';

const line = (startMs: number): TimedLine => ({
  id: String(startMs),
  range: { startMs, endMs: startMs + 1 },
  text: 't',
});

const LINES = [line(10), line(20), line(30)];

describe('locateByStart (.NET List.BinarySearch contract)', () => {
  it('returns the index on an exact start match', () => {
    expect(locateByStart(LINES, 20)).toBe(1);
    expect(locateByStart(LINES, 10)).toBe(0);
    expect(locateByStart(LINES, 30)).toBe(2);
  });

  it('returns ~insertionPoint when not found', () => {
    expect(~locateByStart(LINES, 5)).toBe(0); // before all
    expect(~locateByStart(LINES, 15)).toBe(1); // between 10 and 20
    expect(~locateByStart(LINES, 25)).toBe(2); // between 20 and 30
    expect(~locateByStart(LINES, 99)).toBe(3); // after all → length
  });

  it('treats an empty list as insertion point 0', () => {
    expect(~locateByStart([], 5)).toBe(0);
  });
});
