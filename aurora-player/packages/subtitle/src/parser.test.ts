import { ParseError, type Result } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import type { SubtitleDocument } from './model.js';
import { ParserRegistry, extensionOf, type ISubtitleParser } from './parser.js';
import { SrtParser } from './parsers/srt-parser.js';
import { VttParser } from './parsers/vtt-parser.js';

const SRT = ['1', '00:00:01,000 --> 00:00:02,000', 'hi'].join('\n');
const VTT = ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'hi'].join('\n');

describe('extensionOf', () => {
  it('returns the lowercased extension or undefined', () => {
    expect(extensionOf('a/b/Movie.SRT')).toBe('srt');
    expect(extensionOf('noext')).toBeUndefined();
    expect(extensionOf(undefined)).toBeUndefined();
  });
});

describe('ParserRegistry', () => {
  it('routes each input to the first parser that accepts it', () => {
    const registry = new ParserRegistry()
      .register(new SrtParser())
      .register(new VttParser());

    const srt = registry.find({ content: SRT, filename: 'a.srt' });
    const vtt = registry.find({ content: VTT, filename: 'a.vtt' });
    expect(srt?.id).toBe('srt');
    expect(vtt?.id).toBe('vtt');
  });

  it('parses through the selected parser', () => {
    const registry = new ParserRegistry().register(new SrtParser());
    const result = registry.parse({ content: SRT, filename: 'a.srt' });
    expect(result.ok && result.value.meta.format).toBe('srt');
  });

  it('returns a ParseError when no parser matches (no core switch — OCP)', () => {
    const registry = new ParserRegistry().register(new SrtParser());
    const result = registry.parse({ content: 'garbage', filename: 'a.xyz' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ParseError);
    }
  });

  it('is extensible with a new format via registration alone (OCP)', () => {
    // A hypothetical new format is added without touching existing code.
    class FakeParser implements ISubtitleParser {
      readonly id = 'fake';
      readonly extensions = ['fake'];
      canParse(input: { filename?: string }): boolean {
        return extensionOf(input.filename) === 'fake';
      }
      parse(): Result<SubtitleDocument, ParseError> {
        return {
          ok: true,
          value: {
            lines: [
              { id: '1', range: { startMs: 0, endMs: 1 }, text: 'x' },
            ],
            meta: { format: 'fake' },
            hasWordTimings: false,
          },
        };
      }
    }
    const registry = new ParserRegistry()
      .register(new SrtParser())
      .register(new FakeParser());
    const result = registry.parse({ content: '', filename: 'a.fake' });
    expect(result.ok && result.value.meta.format).toBe('fake');
  });
});
