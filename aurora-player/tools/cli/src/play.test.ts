import type { SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import { formatFrame, runPlayback, type Frame } from './play.js';

const DOC: SubtitleDocument = {
  meta: { format: 'whisperx-json' },
  hasWordTimings: true,
  lines: [
    {
      id: '1',
      range: { startMs: 1000, endMs: 5000 },
      text: 'Hello world',
      words: [
        { text: 'Hello', range: { startMs: 1000, endMs: 3000 } },
        { text: 'world', range: { startMs: 3000, endMs: 5000 } },
      ],
    },
    { id: '2', range: { startMs: 8000, endMs: 10000 }, text: 'bye now' },
  ],
};

const collect = (
  doc: SubtitleDocument,
  options: Parameters<typeof runPlayback>[2] = {},
): Frame[] => {
  const frames: Frame[] = [];
  runPlayback(doc, 'movie.mkv', options, (f) => frames.push(f));
  return frames;
};

describe('runPlayback', () => {
  it('drives the timeline from the clock and ends at the duration', () => {
    const frames = collect(DOC, { stepMs: 1000 });
    expect(frames.length).toBeGreaterThan(0);
    const last = frames.at(-1)!;
    // Duration is the max line end (10000ms); playback rolls over to it exactly.
    expect(last.positionMs).toBe(10000);
    expect(frames.every((f) => f.positionMs <= 10000)).toBe(true);
    // Monotonic non-decreasing positions.
    for (let i = 1; i < frames.length; i += 1) {
      expect(frames[i]!.positionMs).toBeGreaterThanOrEqual(frames[i - 1]!.positionMs);
    }
  });

  it('reports the active line and real word at each frame', () => {
    const frames = collect(DOC, { stepMs: 1000 });
    const at2000 = frames.find((f) => f.positionMs === 2000)!;
    expect(at2000.line).toBe('Hello world');
    expect(at2000.word).toBe('Hello');
    expect(at2000.estimated).toBe(false);
  });

  it('advances faster under higher speed (fewer frames to the end)', () => {
    const slow = collect(DOC, { stepMs: 1000, speed: 1 });
    const fast = collect(DOC, { stepMs: 1000, speed: 2 });
    expect(fast.length).toBeLessThan(slow.length);
    expect(fast.at(-1)!.positionMs).toBe(10000);
  });

  it('does nothing for an empty document', () => {
    const empty: SubtitleDocument = {
      meta: { format: 'srt' },
      hasWordTimings: false,
      lines: [],
    };
    expect(collect(empty)).toHaveLength(0);
  });
});

describe('formatFrame', () => {
  it('renders line and word, flagging estimated timings with ~', () => {
    expect(
      formatFrame({ positionMs: 1500, line: 'hi there', word: 'there', estimated: true }),
    ).toBe('@ 1500ms  ▶ hi there | word: there~');
  });

  it('omits the word segment and shows a placeholder line when absent', () => {
    expect(
      formatFrame({ positionMs: 6000, line: null, word: null, estimated: false }),
    ).toBe('@ 6000ms  ▶ (no subtitle)');
  });
});
