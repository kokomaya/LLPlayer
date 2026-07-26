import { describe, expect, it } from 'vitest';
import type { SubtitleLine } from './model.js';
import {
  copyLineText,
  copyLinesText,
  copyWordText,
  formatTimestamp,
} from './copy-text.js';

const line = (over: Partial<SubtitleLine> = {}): SubtitleLine => ({
  id: 'l1',
  range: { startMs: 62_500, endMs: 65_000 },
  text: 'Hello world',
  ...over,
});

describe('formatTimestamp', () => {
  it.each([
    [0, '00:00:00.000'],
    [62_500, '00:01:02.500'],
    [3_661_007, '01:01:01.007'],
    [-50, '00:00:00.000'],
  ] as const)('formats %d -> %s', (ms, expected) => {
    expect(formatTimestamp(ms)).toBe(expected);
  });
});

describe('copyWordText', () => {
  it('returns the word surface form', () => {
    expect(copyWordText({ text: 'brave' })).toBe('brave');
  });
});

describe('copyLineText', () => {
  it('returns bare text by default', () => {
    expect(copyLineText(line())).toBe('Hello world');
  });

  it('prefixes a timestamp when asked', () => {
    expect(copyLineText(line(), { withTimestamps: true })).toBe('[00:01:02.500] Hello world');
  });

  it('appends translation when present and requested', () => {
    expect(copyLineText(line({ translated: '你好世界' }), { withTranslation: true })).toBe(
      'Hello world\n你好世界',
    );
  });

  it('omits translation when absent or empty even if requested', () => {
    expect(copyLineText(line(), { withTranslation: true })).toBe('Hello world');
    expect(copyLineText(line({ translated: '' }), { withTranslation: true })).toBe('Hello world');
  });
});

describe('copyLinesText', () => {
  const lines: readonly SubtitleLine[] = [
    line({ id: 'a', range: { startMs: 0, endMs: 1000 }, text: 'one' }),
    line({ id: 'b', range: { startMs: 1000, endMs: 2000 }, text: 'two' }),
  ];

  it('joins with a newline by default', () => {
    expect(copyLinesText(lines)).toBe('one\ntwo');
  });

  it('honors a custom separator', () => {
    expect(copyLinesText(lines, { separator: ' ' })).toBe('one two');
  });

  it('applies per-line options', () => {
    expect(copyLinesText(lines, { withTimestamps: true, separator: ' | ' })).toBe(
      '[00:00:00.000] one | [00:00:01.000] two',
    );
  });

  it('returns an empty string for no lines', () => {
    expect(copyLinesText([])).toBe('');
  });
});
