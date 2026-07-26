import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { SrtParser } from './srt-parser.js';

const SAMPLE = [
  '1',
  '00:00:01,000 --> 00:00:05,000',
  '1. Hello World!',
  '',
  '2',
  '00:00:10,000 --> 00:00:15,000',
  'Line one',
  'Line two',
  '',
  '3',
  '00:00:20,000 --> 00:00:25,000',
  "3. I'm fine",
  '',
].join('\n');

describe('SrtParser', () => {
  it('parses times, index and multi-line cues', () => {
    const result = new SrtParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta, hasWordTimings } = result.value;
    expect(meta.format).toBe('srt');
    expect(hasWordTimings).toBe(false);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      range: { startMs: 1000, endMs: 5000 },
      text: '1. Hello World!',
    });
    // Multi-line cue text is preserved (flattening is a display-time concern).
    expect(lines[1]!.text).toBe('Line one\nLine two');
  });

  it('drops empty cues and blocks without a timecode', () => {
    const content = ['1', '00:00:01,000 --> 00:00:02,000', '', 'just a note'].join(
      '\n',
    );
    const result = new SrtParser().parse({ content });
    expect(result.ok && result.value.lines).toHaveLength(0);
  });

  it('canParse uses extension or content sniffing', () => {
    const p = new SrtParser();
    expect(p.canParse({ content: '', filename: 'movie.srt' })).toBe(true);
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(p.canParse({ content: 'no timecodes here' })).toBe(false);
  });
});

runSubtitleParserContract({
  name: 'SrtParser',
  makeParser: () => new SrtParser(),
  valid: { content: SAMPLE, filename: 'basic.srt' },
  minLines: 3,
  rejects: {
    content: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi',
  },
});
