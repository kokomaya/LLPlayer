import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { AssParser } from './ass-parser.js';

const SAMPLE = [
  '[Script Info]',
  'Title: sample',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,{\\pos(400,570)}1. Hello, World!',
  'Dialogue: 0,0:00:10.00,0:00:15.00,Default,,0,0,0,,line one\\Nline two',
  'Dialogue: 0,0:00:20.00,0:00:25.00,Default,,0,0,0,,',
].join('\n');

describe('AssParser', () => {
  it('reads [Events], honours Format order and strips override tags', () => {
    const result = new AssParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta, hasWordTimings } = result.value;
    expect(meta.format).toBe('ass');
    expect(hasWordTimings).toBe(false);
    // The empty (tag-only) dialogue line is dropped.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      range: { startMs: 1000, endMs: 5000 },
      text: '1. Hello, World!',
    });
    // \N becomes a newline; commas inside the text column survive.
    expect(lines[1]!.text).toBe('line one\nline two');
  });

  it('canParse uses extension or [Script Info]/Dialogue sniffing', () => {
    const p = new AssParser();
    expect(p.canParse({ content: '', filename: 'movie.ass' })).toBe(true);
    expect(p.canParse({ content: '', filename: 'movie.ssa' })).toBe(true);
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(p.canParse({ content: 'nothing here' })).toBe(false);
  });
});

runSubtitleParserContract({
  name: 'AssParser',
  makeParser: () => new AssParser(),
  valid: { content: SAMPLE, filename: 'basic.ass' },
  minLines: 2,
  rejects: { content: 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nhi' },
});
