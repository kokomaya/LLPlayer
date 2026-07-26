import { describe, expect, it } from 'vitest';
import { runSubtitleParserContract } from '../contract/parser-contract.js';
import { LrcParser } from './lrc-parser.js';

const SAMPLE = [
  '[ti:Song title]',
  '[ar:Artist]',
  '[00:01.00]1. Hello World!',
  '[00:10.50]2. How are you',
  '[00:20.00]3. I\'m fine',
].join('\n');

describe('LrcParser', () => {
  it('derives end times from the next cue; last gets a trailing window', () => {
    const result = new LrcParser().parse({ content: SAMPLE });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { lines, meta, hasWordTimings } = result.value;
    expect(meta.format).toBe('lrc');
    expect(meta.title).toBe('Song title');
    expect(hasWordTimings).toBe(false);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      range: { startMs: 1000, endMs: 10500 },
      text: '1. Hello World!',
    });
    expect(lines[1]!.range).toEqual({ startMs: 10500, endMs: 20000 });
    // Final line has no successor -> +4000ms trailing window.
    expect(lines[2]!.range).toEqual({ startMs: 20000, endMs: 24000 });
  });

  it('applies [offset:] and expands repeated time tags', () => {
    const content = ['[offset:500]', '[00:02.00][00:04.00]repeat'].join('\n');
    const result = new LrcParser().parse({ content });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // offset:500 shifts starts earlier by 500ms; both tags produce a cue.
    expect(result.value.lines.map((l) => l.range.startMs)).toEqual([1500, 3500]);
  });

  it('canParse uses extension or a leading time tag, declining SRT/JSON', () => {
    const p = new LrcParser();
    expect(p.canParse({ content: '', filename: 'song.lrc' })).toBe(true);
    expect(p.canParse({ content: SAMPLE })).toBe(true);
    expect(p.canParse({ content: '{"segments":[]}' })).toBe(false);
    expect(
      p.canParse({ content: '1\n00:00:01,000 --> 00:00:02,000\nhi' }),
    ).toBe(false);
  });
});

runSubtitleParserContract({
  name: 'LrcParser',
  makeParser: () => new LrcParser(),
  valid: { content: SAMPLE, filename: 'basic.lrc' },
  minLines: 3,
  rejects: { content: '1\n00:00:01,000 --> 00:00:02,000\nhi' },
});
