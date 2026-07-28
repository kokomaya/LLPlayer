import { describe, expect, it } from 'vitest';
import { EventBus, createEvent } from '@aurora/domain';
import type { SubtitleLine } from '@aurora/subtitle';
import { SubtitleListPresenter } from './subtitle-list-presenter.js';

const LINES: readonly SubtitleLine[] = [
  {
    id: 'l1',
    range: { startMs: 1000, endMs: 4000 },
    text: 'Hello brave world',
    words: [
      { text: 'Hello', range: { startMs: 1000, endMs: 1500 } },
      { text: 'brave', range: { startMs: 2000, endMs: 3000 } },
      { text: 'world', range: { startMs: 3000, endMs: 4000 } },
    ],
  },
  { id: 'l2', range: { startMs: 5000, endMs: 7000 }, text: 'good bye' },
  { id: 'l3', range: { startMs: 8000, endMs: 9000 }, text: 'the end' },
];

const at = (bus: EventBus, positionMs: number): void => {
  bus.publish(createEvent('PositionChanged', { positionMs }, 0));
};

describe('SubtitleListPresenter · model', () => {
  it('exposes the full word-addressable line model up front', () => {
    const p = new SubtitleListPresenter(LINES);
    expect(p.lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l3']);
    expect(p.lines[0]!.words.map((w) => w.targetMs)).toEqual([1000, 2000, 3000]);
    expect(p.state.mode).toBe('list');
    p.dispose();
  });
});

describe('SubtitleListPresenter · active tracking', () => {
  it('tracks the active line and word from PositionChanged', () => {
    const bus = new EventBus();
    const p = new SubtitleListPresenter(LINES).connect(bus);
    const seen: (number | null)[] = [];
    p.onChange((s) => seen.push(s.activeLineIndex));

    at(bus, 2500); // inside l1, word "brave"
    expect(p.state.activeLineIndex).toBe(0);
    expect(p.state.activeWordIndex).toBe(1);

    at(bus, 5500); // inside l2 (interpolated words)
    expect(p.state.activeLineIndex).toBe(1);

    at(bus, 4500); // gap between l1 and l2
    expect(p.state.activeLineIndex).toBeNull();
    expect(p.state.activeWordIndex).toBeNull();

    expect(seen).toEqual([0, 1, null]);
    p.dispose();
  });
});

describe('SubtitleListPresenter · fullscreen windowing', () => {
  it('list mode exposes the whole range', () => {
    const p = new SubtitleListPresenter(LINES, { mode: 'list' });
    expect(p.state.visibleRange).toEqual({ start: 0, end: 3 });
    p.dispose();
  });

  it('fullscreen windows around the active line by lineCount', () => {
    const bus = new EventBus();
    const p = new SubtitleListPresenter(LINES, { mode: 'fullscreen', lineCount: 1 }).connect(bus);
    at(bus, 8500); // l3 active
    expect(p.state.visibleRange).toEqual({ start: 2, end: 3 });
    p.dispose();
  });

  it('setMode / setLineCount recompute and emit immediately', () => {
    const bus = new EventBus();
    const p = new SubtitleListPresenter(LINES, { mode: 'list' }).connect(bus);
    at(bus, 8500); // l3 active
    let last = p.state;
    p.onChange((s) => (last = s));

    p.setMode('fullscreen');
    expect(last.mode).toBe('fullscreen');
    p.setLineCount(1);
    expect(last.lineCount).toBe(1);
    expect(last.visibleRange).toEqual({ start: 2, end: 3 });
    p.dispose();
  });

  it('does not emit when set to the current mode / count', () => {
    const p = new SubtitleListPresenter(LINES, { mode: 'list', lineCount: 3 });
    let calls = 0;
    p.onChange(() => (calls += 1));
    p.setMode('list');
    p.setLineCount(3);
    expect(calls).toBe(0);
    p.dispose();
  });
});

describe('SubtitleListPresenter · lifecycle', () => {
  it('stops updating after dispose', () => {
    const bus = new EventBus();
    const p = new SubtitleListPresenter(LINES).connect(bus);
    let calls = 0;
    p.onChange(() => (calls += 1));
    at(bus, 2500);
    const after = calls;
    p.dispose();
    at(bus, 5500);
    expect(calls).toBe(after);
  });
});
