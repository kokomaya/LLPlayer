import { describe, expect, it } from 'vitest';
import type { TimedLine } from './model.js';
import { WordCursor } from './word-cursor.js';

// Two lines: the first fully word-timed (WhisperX-style), the second timing-free.
const TIMED: readonly TimedLine[] = [
  {
    id: '1',
    range: { startMs: 1000, endMs: 5000 },
    text: 'Hello brave world',
    words: [
      { text: 'Hello', range: { startMs: 1000, endMs: 2000 } },
      { text: 'brave', range: { startMs: 2000, endMs: 3500 } },
      { text: 'world', range: { startMs: 3500, endMs: 5000 } },
    ],
  },
  {
    id: '2',
    range: { startMs: 10000, endMs: 14000 },
    text: 'no timings here',
  },
];

describe('WordCursor with real word timings', () => {
  it('currentWord returns the containing word, not estimated', () => {
    const c = new WordCursor(TIMED);
    const hit = c.currentWord(2500);
    expect(hit?.text).toBe('brave');
    expect(hit?.estimated).toBe(false);
    expect(hit?.range).toEqual({ startMs: 2000, endMs: 3500 });
    expect(hit?.wordIndex).toBe(1);
    expect(hit?.line.id).toBe('1');
  });

  it('currentWord is inclusive of a word start and null in gaps', () => {
    const c = new WordCursor(TIMED);
    expect(c.currentWord(1000)?.text).toBe('Hello');
    // Between the two lines: no word contains 7000ms.
    expect(c.currentWord(7000)).toBeNull();
  });
});

describe('WordCursor degradation (no word timings)', () => {
  it('interpolates by char length and flags results estimated', () => {
    const c = new WordCursor(TIMED);
    const hit = c.currentWord(10500);
    expect(hit?.estimated).toBe(true);
    expect(hit?.text).toBe('no');
    expect(hit?.line.id).toBe('2');
    // Words tile the whole line without gaps, ending exactly at line end.
    const line2 = c.words.filter((w) => w.line.id === '2');
    expect(line2.map((w) => w.text)).toEqual(['no', 'timings', 'here']);
    expect(line2[0]!.range.startMs).toBe(10000);
    expect(line2.at(-1)!.range.endMs).toBe(14000);
    for (let i = 1; i < line2.length; i += 1) {
      expect(line2[i]!.range.startMs).toBe(line2[i - 1]!.range.endMs);
    }
  });

  it('degrades the whole line when only some words are timed', () => {
    const partial: readonly TimedLine[] = [
      {
        id: '1',
        range: { startMs: 0, endMs: 3000 },
        text: 'a bb ccc',
        words: [
          { text: 'a', range: { startMs: 0, endMs: 1000 } },
          { text: 'bb' }, // untimed
          { text: 'ccc', range: { startMs: 2000, endMs: 3000 } },
        ],
      },
    ];
    const c = new WordCursor(partial);
    expect(c.words.every((w) => w.estimated)).toBe(true);
  });
});

describe('WordCursor.nearestWord', () => {
  const c = new WordCursor(TIMED);

  it('returns the containing word when inside one', () => {
    expect(c.nearestWord(2500)?.text).toBe('brave');
  });

  it('clamps before the first and after the last word', () => {
    expect(c.nearestWord(0)?.text).toBe('Hello');
    expect(c.nearestWord(999999)?.text).toBe('here');
  });

  it('picks the closer edge across a gap', () => {
    // 5400 is 400ms past "world" (ends 5000) and far from line 2's start.
    expect(c.nearestWord(5400)?.text).toBe('world');
  });
});

describe('WordCursor navigation (seek + jumpWord)', () => {
  it('seek positions the cursor on the nearest word', () => {
    const c = new WordCursor(TIMED);
    c.seek(3600);
    expect(c.current()?.text).toBe('world');
  });

  it('jumpWord steps forward and backward across line boundaries', () => {
    const c = new WordCursor(TIMED);
    c.seek(3600); // "world" (last word of line 1)
    expect(c.jumpWord('next')?.text).toBe('no'); // first word of line 2
    expect(c.jumpWord('prev')?.text).toBe('world');
  });

  it('from an unset cursor, next starts at the first word and prev is null', () => {
    const c = new WordCursor(TIMED);
    expect(c.jumpWord('prev')).toBeNull();
    expect(c.jumpWord('next')?.text).toBe('Hello');
  });

  it('returns null at the ends without moving the cursor', () => {
    const c = new WordCursor(TIMED);
    c.seek(999999); // last word "here"
    expect(c.current()?.text).toBe('here');
    expect(c.jumpWord('next')).toBeNull();
    expect(c.current()?.text).toBe('here');
  });
});

describe('WordCursor empty sequence', () => {
  it('is inert with no words', () => {
    const c = new WordCursor([]);
    expect(c.words).toHaveLength(0);
    expect(c.currentWord(5)).toBeNull();
    expect(c.nearestWord(5)).toBeNull();
    expect(c.current()).toBeNull();
    expect(c.jumpWord('next')).toBeNull();
    expect(c.seek(5).current()).toBeNull();
  });
});
