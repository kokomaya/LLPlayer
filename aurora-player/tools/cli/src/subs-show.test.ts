import type { SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import { formatSubsShow, querySubtitleAt } from './subs-show.js';

const DOC: SubtitleDocument = {
  meta: { format: 'srt' },
  hasWordTimings: false,
  lines: [
    { id: '1', range: { startMs: 1000, endMs: 5000 }, text: 'Hello\nWorld' },
    { id: '2', range: { startMs: 10000, endMs: 15000 }, text: 'Second' },
  ],
};

describe('querySubtitleAt', () => {
  it('returns the showing line flattened for display', () => {
    const r = querySubtitleAt(DOC, 2000);
    expect(r.state).toBe('showing');
    expect(r.current).toBe('Hello World'); // flattened
    expect(r.next).toBe('Second');
  });

  it('returns null current with prev/next in a gap', () => {
    const r = querySubtitleAt(DOC, 7000);
    expect(r.state).toBe('around');
    expect(r.current).toBeNull();
    expect(r.prev).toBe('Hello World');
    expect(r.next).toBe('Second');
  });
});

describe('formatSubsShow', () => {
  it('formats a showing line with the play marker', () => {
    const text = formatSubsShow(querySubtitleAt(DOC, 2000));
    expect(text).toContain('[showing]');
    expect(text).toContain('▶ Hello World');
  });

  it('formats a gap with prev/next hints', () => {
    const text = formatSubsShow(querySubtitleAt(DOC, 7000));
    expect(text).toContain('no subtitle showing');
    expect(text).toContain('prev: Hello World');
    expect(text).toContain('next: Second');
  });
});
