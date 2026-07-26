import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './index.js';

/**
 * Golden-sample tests (plan/09 §1). The two fixtures encode the same cues as
 * the ported FlyleafLibTests fixture — verifying that both formats collapse to
 * the identical {@link SubtitleDocument}.
 */
const SAMPLES_DIR = fileURLToPath(
  new URL('../../../samples/subtitles/', import.meta.url),
);

const read = (file: string): string =>
  readFileSync(`${SAMPLES_DIR}${file}`, 'utf8');

// The canonical timings/text shared by both golden fixtures.
const EXPECTED = [
  { startMs: 1000, endMs: 5000, text: '1. Hello World!' },
  { startMs: 10000, endMs: 15000, text: '2. How are you' },
  { startMs: 20000, endMs: 25000, text: "3. I'm fine" },
  { startMs: 28000, endMs: 29000, text: '4. Thank you' },
  { startMs: 30000, endMs: 35000, text: '5. Good bye' },
] as const;

describe('golden subtitle samples', () => {
  it.each([
    ['basic.srt', 'srt'],
    ['basic.vtt', 'vtt'],
    ['basic.ass', 'ass'],
    ['basic.whisper.json', 'whisper-json'],
    ['basic.whisperx.json', 'whisperx-json'],
  ])('parses %s into the canonical document', (file, format) => {
    const registry = createDefaultRegistry();
    const result = registry.parse({ content: read(file), filename: file });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { lines, meta } = result.value;
    expect(meta.format).toBe(format);
    expect(lines).toHaveLength(EXPECTED.length);
    lines.forEach((line, i) => {
      const want = EXPECTED[i]!;
      expect(line.range.startMs).toBe(want.startMs);
      expect(line.range.endMs).toBe(want.endMs);
      expect(line.text).toBe(want.text);
    });
  });

  it('WhisperX maps word-level timings onto Word.range', () => {
    const registry = createDefaultRegistry();
    const result = registry.parse({
      content: read('basic.whisperx.json'),
      filename: 'basic.whisperx.json',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.hasWordTimings).toBe(true);

    const third = result.value.lines[2]!; // "3. I'm fine"
    expect(third.text).toBe("3. I'm fine");
    expect(third.words?.map((w) => w.text)).toEqual(['3.', "I'm", 'fine']);
    expect(third.words?.[1]).toEqual({
      text: "I'm",
      range: { startMs: 20400, endMs: 22000 },
    });
    // Every word sits within its line's range.
    for (const w of third.words ?? []) {
      expect(w.range!.startMs).toBeGreaterThanOrEqual(third.range.startMs);
      expect(w.range!.endMs).toBeLessThanOrEqual(third.range.endMs);
    }
  });

  it('LRC matches canonical starts/text; ends derive from the next cue', () => {
    const registry = createDefaultRegistry();
    const result = registry.parse({
      content: read('basic.lrc'),
      filename: 'basic.lrc',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { lines, meta } = result.value;
    expect(meta.format).toBe('lrc');
    expect(meta.title).toBe('Aurora golden sample');
    expect(lines).toHaveLength(EXPECTED.length);
    lines.forEach((line, i) => {
      expect(line.range.startMs).toBe(EXPECTED[i]!.startMs);
      expect(line.text).toBe(EXPECTED[i]!.text);
    });
    // End = next start; the final line gets a trailing window.
    expect(lines[0]!.range.endMs).toBe(EXPECTED[1]!.startMs);
    expect(lines.at(-1)!.range.endMs).toBe(EXPECTED.at(-1)!.startMs + 4000);
  });

  it('SRT and VTT samples produce identical cue text and timings', () => {
    const registry = createDefaultRegistry();
    const srt = registry.parse({ content: read('basic.srt'), filename: 'basic.srt' });
    const vtt = registry.parse({ content: read('basic.vtt'), filename: 'basic.vtt' });
    expect(srt.ok && vtt.ok).toBe(true);
    if (!srt.ok || !vtt.ok) {
      return;
    }
    const strip = (d: (typeof srt)['value']) =>
      d.lines.map((l) => ({ ...l.range, text: l.text }));
    expect(strip(srt.value)).toEqual(strip(vtt.value));
  });
});
