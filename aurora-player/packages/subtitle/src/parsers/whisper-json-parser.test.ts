import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { WhisperJsonParser } from './whisper-json-parser.js';

const SAMPLE = JSON.stringify({
  language: 'en',
  segments: [
    { id: 0, start: 1.0, end: 5.0, text: '1. Hello World!' },
    { id: 1, start: 10.0, end: 15.0, text: '2. How are you' },
    { id: 2, start: 20.0, end: 25.0, text: "3. I'm fine" },
  ],
});

describe('WhisperJsonParser', () => {
  it('maps seconds to ms and keeps segment-level timings only', () => {
    const result = new WhisperJsonParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta, hasWordTimings } = result.value;
    expect(meta.format).toBe('whisper-json');
    expect(meta.language).toBe('en');
    expect(hasWordTimings).toBe(false);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      range: { startMs: 1000, endMs: 5000 },
      text: '1. Hello World!',
    });
    // Segment-level parser never populates words.
    expect(lines[0]!.words).toBeUndefined();
  });

  it('canParse accepts plain Whisper but declines WhisperX (word_segments)', () => {
    const p = new WhisperJsonParser();
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(
      p.canParse({ content: JSON.stringify({ segments: [{ start: 0 }], word_segments: [] }) }),
    ).toBe(false);
    expect(p.canParse({ content: 'not json' })).toBe(false);
    expect(p.canParse({ content: '{}' })).toBe(false);
  });
});

runSubtitleParserContract({
  name: 'WhisperJsonParser',
  makeParser: () => new WhisperJsonParser(),
  valid: { content: SAMPLE, filename: 'basic.whisper.json' },
  minLines: 3,
  rejects: { content: '1\n00:00:01,000 --> 00:00:02,000\nhi' },
});
