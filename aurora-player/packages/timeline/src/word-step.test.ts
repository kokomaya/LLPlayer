import { describe, expect, it } from 'vitest';
import type { TimedLine } from './model.js';
import { nextWordSeekMs, prevWordSeekMs, wordSeek } from './word-step.js';

// Two lines with real word timings; a gap between 4000 and 5000.
const LINES: readonly TimedLine[] = [
  {
    id: 'l1',
    range: { startMs: 1000, endMs: 4000 },
    text: 'Hello brave world',
    words: [
      { text: 'Hello', range: { startMs: 1000, endMs: 1500 } },
      { text: 'brave', range: { startMs: 2000, endMs: 3000 } },
      { text: 'world', range: { startMs: 3000, endMs: 4000 } },
    ],
  },
  {
    id: 'l2',
    range: { startMs: 5000, endMs: 7000 },
    text: 'good bye',
    words: [
      { text: 'good', range: { startMs: 5000, endMs: 6000 } },
      { text: 'bye', range: { startMs: 6000, endMs: 7000 } },
    ],
  },
];

describe('nextWordSeekMs', () => {
  it('lands on the first word starting after the position', () => {
    const step = nextWordSeekMs(LINES, 2500);
    expect(step?.targetMs).toBe(3000);
    expect(step?.word.text).toBe('world');
    expect(step?.estimated).toBe(false);
  });

  it('crosses the line gap to the next line', () => {
    expect(nextWordSeekMs(LINES, 3500)?.word.text).toBe('good');
  });

  it('starts from the first word when before all words', () => {
    expect(nextWordSeekMs(LINES, 0)?.targetMs).toBe(1000);
  });

  it('returns null past the last word', () => {
    expect(nextWordSeekMs(LINES, 7000)).toBeNull();
  });
});

describe('prevWordSeekMs', () => {
  it('re-hears the current word from mid-word', () => {
    const step = prevWordSeekMs(LINES, 2500);
    expect(step?.targetMs).toBe(2000);
    expect(step?.word.text).toBe('brave');
  });

  it('steps to the previous word when exactly at a word start', () => {
    expect(prevWordSeekMs(LINES, 2000)?.word.text).toBe('Hello');
  });

  it('returns null at/before the first word', () => {
    expect(prevWordSeekMs(LINES, 1000)).toBeNull();
    expect(prevWordSeekMs(LINES, 0)).toBeNull();
  });
});

describe('wordSeek edge cases', () => {
  it('returns null for an empty document either direction', () => {
    expect(wordSeek([], 1000, 'next')).toBeNull();
    expect(wordSeek([], 1000, 'prev')).toBeNull();
  });

  it('flags interpolated words as estimated', () => {
    const noTimings: readonly TimedLine[] = [
      { id: 'x', range: { startMs: 0, endMs: 2000 }, text: 'alpha beta' },
    ];
    const step = nextWordSeekMs(noTimings, -1);
    expect(step?.word.text).toBe('alpha');
    expect(step?.estimated).toBe(true);
  });
});
