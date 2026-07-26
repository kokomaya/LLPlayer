import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { VttParser } from './vtt-parser.js';

const SAMPLE = [
  'WEBVTT',
  '',
  'NOTE this is a comment block',
  '',
  'intro',
  '00:00:01.000 --> 00:00:05.000 line:0 position:50%',
  '1. Hello World!',
  '',
  '00:00:10.000 --> 00:00:15.000',
  '<c>styled</c> text',
  '',
].join('\n');

describe('VttParser', () => {
  it('skips header/NOTE, drops cue settings, strips inline tags', () => {
    const result = new VttParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta } = result.value;
    expect(meta.format).toBe('vtt');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      range: { startMs: 1000, endMs: 5000 },
      text: '1. Hello World!',
    });
    expect(lines[1]!.text).toBe('styled text');
  });

  it('accepts MM:SS.mmm cue times', () => {
    const content = ['WEBVTT', '', '00:01.500 --> 00:03.000', 'short'].join('\n');
    const result = new VttParser().parse({ content });
    expect(result.ok && result.value.lines[0]!.range).toEqual({
      startMs: 1500,
      endMs: 3000,
    });
  });

  it('canParse uses extension or WEBVTT header', () => {
    const p = new VttParser();
    expect(p.canParse({ content: '', filename: 'movie.vtt' })).toBe(true);
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(p.canParse({ content: '1\n00:00:01,000 --> 00:00:02,000\nhi' })).toBe(
      false,
    );
  });
});

runSubtitleParserContract({
  name: 'VttParser',
  makeParser: () => new VttParser(),
  valid: { content: SAMPLE, filename: 'basic.vtt' },
  minLines: 2,
  rejects: { content: '1\n00:00:01,000 --> 00:00:02,000\nhi' },
});
