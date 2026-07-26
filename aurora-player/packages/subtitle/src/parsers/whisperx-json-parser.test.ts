import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { WhisperXJsonParser } from './whisperx-json-parser.js';

const SAMPLE = JSON.stringify({
  language: 'en',
  segments: [
    {
      start: 1.0,
      end: 5.0,
      text: '1. Hello World!',
      words: [
        { word: '1.', start: 1.0, end: 1.4 },
        { word: 'Hello', start: 1.4, end: 3.0 },
        // Untimed word (aligner dropped it) — keeps text, omits range.
        { word: 'World!' },
      ],
    },
    {
      // No explicit segment bounds -> spanned from word ranges.
      text: '2. How are you',
      words: [
        { word: '2.', start: 10.0, end: 10.4 },
        { word: 'you', start: 13.0, end: 15.0 },
      ],
    },
  ],
  word_segments: [{ word: '1.', start: 1.0, end: 1.4 }],
});

describe('WhisperXJsonParser', () => {
  it('maps word timings onto Word.range and sets hasWordTimings', () => {
    const result = new WhisperXJsonParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta, hasWordTimings } = result.value;
    expect(meta.format).toBe('whisperx-json');
    expect(meta.language).toBe('en');
    expect(hasWordTimings).toBe(true);
    expect(lines).toHaveLength(2);

    const first = lines[0]!;
    expect(first.range).toEqual({ startMs: 1000, endMs: 5000 });
    expect(first.words).toEqual([
      { text: '1.', range: { startMs: 1000, endMs: 1400 } },
      { text: 'Hello', range: { startMs: 1400, endMs: 3000 } },
      { text: 'World!' }, // untimed -> no range
    ]);
  });

  it('spans segment bounds from words when start/end are absent', () => {
    const result = new WhisperXJsonParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines[1]!.range).toEqual({ startMs: 10000, endMs: 15000 });
  });

  it('canParse requires both segments and word_segments arrays', () => {
    const p = new WhisperXJsonParser();
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(
      p.canParse({ content: JSON.stringify({ segments: [{ start: 0 }] }) }),
    ).toBe(false);
    expect(p.canParse({ content: 'not json' })).toBe(false);
  });
});

runSubtitleParserContract({
  name: 'WhisperXJsonParser',
  makeParser: () => new WhisperXJsonParser(),
  valid: { content: SAMPLE, filename: 'basic.whisperx.json' },
  minLines: 2,
  rejects: { content: JSON.stringify({ segments: [{ start: 0, end: 1, text: 'x' }] }) },
});
