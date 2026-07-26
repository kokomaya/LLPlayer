import type { SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import { formatSubsWords, queryWordAt } from './subs-words.js';

const TIMED: SubtitleDocument = {
  meta: { format: 'whisperx-json' },
  hasWordTimings: true,
  lines: [
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
  ],
};

const SENTENCE_ONLY: SubtitleDocument = {
  meta: { format: 'srt' },
  hasWordTimings: false,
  lines: [{ id: '1', range: { startMs: 0, endMs: 3000 }, text: 'one two three' }],
};

describe('queryWordAt', () => {
  it('returns the real word (not estimated) for a word-timed document', () => {
    const r = queryWordAt(TIMED, 2500);
    expect(r.line).toBe('Hello brave world');
    expect(r.word).toBe('brave');
    expect(r.estimated).toBe(false);
    expect(r.hasWordTimings).toBe(true);
  });

  it('estimates the word by interpolation when timings are absent', () => {
    const r = queryWordAt(SENTENCE_ONLY, 500);
    expect(r.word).toBe('one');
    expect(r.estimated).toBe(true);
    expect(r.hasWordTimings).toBe(false);
  });

  it('reports null line and word in a gap', () => {
    const r = queryWordAt(TIMED, 8000);
    expect(r.line).toBeNull();
    expect(r.word).toBeNull();
    expect(r.estimated).toBe(false);
  });
});

describe('formatSubsWords', () => {
  it('marks estimated words and shows the timing mode', () => {
    const text = formatSubsWords(queryWordAt(SENTENCE_ONLY, 500));
    expect(text).toContain('[sentence-only]');
    expect(text).toContain('one (estimated)');
  });

  it('renders a real word without the estimated marker', () => {
    const text = formatSubsWords(queryWordAt(TIMED, 2500));
    expect(text).toContain('[word-timed]');
    expect(text).toContain('word: brave');
    expect(text).not.toContain('estimated');
  });

  it('renders placeholders when nothing is showing', () => {
    const text = formatSubsWords(queryWordAt(TIMED, 8000));
    expect(text).toContain('(no subtitle showing)');
    expect(text).toContain('(no word)');
  });
});
