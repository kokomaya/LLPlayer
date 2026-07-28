import { describe, expect, it } from 'vitest';
import type { SubtitleLine } from '@aurora/subtitle';
import { buildSubtitleLineVMs, computeLineWindow } from './subtitle-view.js';

const TIMED: readonly SubtitleLine[] = [
  {
    id: 'l1',
    range: { startMs: 1000, endMs: 4000 },
    text: 'Hello brave world',
    translated: '你好\n勇敢的世界',
    words: [
      { text: 'Hello', range: { startMs: 1000, endMs: 1500 } },
      { text: 'brave', range: { startMs: 2000, endMs: 3000 } },
      { text: 'world', range: { startMs: 3000, endMs: 4000 } },
    ],
  },
  { id: 'l2', range: { startMs: 5000, endMs: 7000 }, text: 'good bye' },
];

describe('buildSubtitleLineVMs', () => {
  it('produces one VM per source line in document order', () => {
    const vms = buildSubtitleLineVMs(TIMED);
    expect(vms.map((v) => v.id)).toEqual(['l1', 'l2']);
    expect(vms.map((v) => v.lineIndex)).toEqual([0, 1]);
    expect(vms[0]!.startMs).toBe(1000);
    expect(vms[0]!.endMs).toBe(4000);
  });

  it('exposes tappable words with real seek targets, in reading order', () => {
    const [line] = buildSubtitleLineVMs(TIMED);
    expect(line!.words.map((w) => w.text)).toEqual(['Hello', 'brave', 'world']);
    expect(line!.words.map((w) => w.targetMs)).toEqual([1000, 2000, 3000]);
    expect(line!.words.every((w) => !w.estimated)).toBe(true);
  });

  it('interpolates + flags words when a line has no word timings', () => {
    const [, line] = buildSubtitleLineVMs(TIMED);
    expect(line!.words.map((w) => w.text)).toEqual(['good', 'bye']);
    expect(line!.words[0]!.targetMs).toBe(5000); // first word starts at line start
    expect(line!.words.every((w) => w.estimated)).toBe(true);
  });

  it('flattens multi-line text + translation to single lines', () => {
    const [line] = buildSubtitleLineVMs(TIMED);
    expect(line!.translated).toBe('你好 勇敢的世界');
    expect(line!.text).toBe('Hello brave world');
  });

  it('leaves translated null when the source carried none', () => {
    expect(buildSubtitleLineVMs(TIMED)[1]!.translated).toBeNull();
  });
});

describe('computeLineWindow', () => {
  it('centers the active line and clamps into range', () => {
    // 10 lines, show 3, active at 5 → [4,7)
    expect(computeLineWindow(5, 10, 3)).toEqual({ start: 4, end: 7 });
  });

  it('anchors at the top near the head', () => {
    expect(computeLineWindow(0, 10, 3)).toEqual({ start: 0, end: 3 });
    expect(computeLineWindow(1, 10, 3)).toEqual({ start: 0, end: 3 });
  });

  it('anchors at the bottom near the tail', () => {
    expect(computeLineWindow(9, 10, 3)).toEqual({ start: 7, end: 10 });
  });

  it('anchors at the top when there is no active line', () => {
    expect(computeLineWindow(null, 10, 4)).toEqual({ start: 0, end: 4 });
  });

  it('shows everything when count exceeds total', () => {
    expect(computeLineWindow(2, 4, 99)).toEqual({ start: 0, end: 4 });
  });

  it('is empty for non-positive count or empty list', () => {
    expect(computeLineWindow(0, 0, 3)).toEqual({ start: 0, end: 0 });
    expect(computeLineWindow(1, 10, 0)).toEqual({ start: 0, end: 0 });
  });
});
