import { describe, expect, it } from 'vitest';
import type { TimedLine } from './model.js';
import { SubtitleTimeline } from './timeline.js';

// Fixture ported verbatim from FlyleafLibTests SubManagerTests (seconds → ms).
const s = (n: number): number => n * 1000;
const FIXTURE: readonly TimedLine[] = [
  { id: '1', range: { startMs: s(1), endMs: s(5) }, text: '1. Hello World!' },
  { id: '2', range: { startMs: s(10), endMs: s(15) }, text: '2. How are you' },
  { id: '3', range: { startMs: s(20), endMs: s(25) }, text: "3. I'm fine" },
  { id: '4', range: { startMs: s(28), endMs: s(29) }, text: '4. Thank you' },
  { id: '5', range: { startMs: s(30), endMs: s(35) }, text: '5. Good bye' },
];

const make = (): SubtitleTimeline => new SubtitleTimeline(FIXTURE);

describe('SubtitleTimeline seek (ported from SubManagerTests)', () => {
  it('First_Yet: before the first subtitle', () => {
    const t = make().seek(s(0.5));
    expect(t.state).toBe('first');
    expect(t.currentIndex).toBe(-1);
    expect(t.currentLine()).toBeNull();
    expect(t.prevLine()).toBeNull();
    expect(t.nextLine()?.text).toBe(FIXTURE[0]!.text);
  });

  it('First_Showing: during the first subtitle', () => {
    const t = make().seek(s(1));
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(0);
    expect(t.currentLine()?.text).toBe(FIXTURE[0]!.text);
    expect(t.prevLine()).toBeNull();
    expect(t.nextLine()?.text).toBe(FIXTURE[1]!.text);
  });

  it('Middle_Showing: during a middle subtitle', () => {
    const t = make().seek(s(22));
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(2);
    expect(t.currentLine()?.text).toBe(FIXTURE[2]!.text);
    expect(t.prevLine()?.text).toBe(FIXTURE[1]!.text);
    expect(t.nextLine()?.text).toBe(FIXTURE[3]!.text);
  });

  it('Middle_Yet: in the gap just before a middle subtitle', () => {
    const t = make().seek(s(18));
    expect(t.state).toBe('around');
    expect(t.currentIndex).toBe(1); // nextIndex - 1
    expect(t.currentLine()).toBeNull();
    expect(t.prevLine()?.text).toBe(FIXTURE[1]!.text);
    expect(t.nextLine()?.text).toBe(FIXTURE[2]!.text);
  });

  it('Last_Showing: during the last subtitle', () => {
    const t = make().seek(s(35));
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(4);
    expect(t.currentLine()?.text).toBe(FIXTURE[4]!.text);
    expect(t.prevLine()?.text).toBe(FIXTURE[3]!.text);
    expect(t.nextLine()).toBeNull();
  });

  it('Last_Past: after the last subtitle', () => {
    const t = make().seek(s(99));
    expect(t.state).toBe('last');
    expect(t.currentIndex).toBe(4);
    expect(t.currentLine()).toBeNull();
    expect(t.prevLine()?.text).toBe(FIXTURE[4]!.text);
    expect(t.nextLine()).toBeNull();
  });
});

describe('SubtitleTimeline fast-path and boundaries', () => {
  it('exact start boundary counts as showing', () => {
    const t = make().seek(s(20));
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(2);
  });

  it('exact end boundary still counts as showing (inclusive)', () => {
    const t = make().seek(s(25));
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(2);
  });

  it('re-seeking within the same showing line is a no-op fast path', () => {
    const t = make().seek(s(22));
    expect(t.currentIndex).toBe(2);
    t.seek(s(23)); // still strictly inside line 3
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(2);
  });

  it('sorts unsorted input defensively', () => {
    const shuffled = [FIXTURE[2]!, FIXTURE[0]!, FIXTURE[4]!, FIXTURE[1]!, FIXTURE[3]!];
    const t = new SubtitleTimeline(shuffled).seek(s(22));
    expect(t.currentLine()?.text).toBe("3. I'm fine");
  });
});

describe('SubtitleTimeline jumpSentence', () => {
  it('jumps forward onto the next line and seeks to its start', () => {
    const t = make().seek(s(22)); // showing line 3
    const jumped = t.jumpSentence('next');
    expect(jumped?.text).toBe(FIXTURE[3]!.text);
    expect(t.state).toBe('showing');
    expect(t.currentIndex).toBe(3);
  });

  it('jumps backward onto the previous line', () => {
    const t = make().seek(s(22));
    const jumped = t.jumpSentence('prev');
    expect(jumped?.text).toBe(FIXTURE[1]!.text);
    expect(t.currentIndex).toBe(1);
  });

  it('from the first-gap, next jumps onto the first line', () => {
    const t = make().seek(s(0.5));
    const jumped = t.jumpSentence('next');
    expect(jumped?.text).toBe(FIXTURE[0]!.text);
    expect(t.currentIndex).toBe(0);
  });

  it('returns null when there is nothing in that direction', () => {
    const t = make().seek(s(99)); // last
    expect(t.jumpSentence('next')).toBeNull();
    const head = make().seek(s(0.5));
    expect(head.jumpSentence('prev')).toBeNull();
  });
});

describe('SubtitleTimeline empty sequence', () => {
  it('is inert with no lines', () => {
    const t = new SubtitleTimeline([]).seek(s(5));
    expect(t.state).toBe('first');
    expect(t.currentLine()).toBeNull();
    expect(t.nextLine()).toBeNull();
    expect(t.prevLine()).toBeNull();
    expect(t.jumpSentence('next')).toBeNull();
  });
});
