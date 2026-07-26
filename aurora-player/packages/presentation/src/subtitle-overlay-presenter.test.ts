import { EventBus, createEvent } from '@aurora/domain';
import type { TimedLine } from '@aurora/timeline';
import { describe, expect, it } from 'vitest';
import {
  SubtitleOverlayPresenter,
  type OverlayViewState,
} from './subtitle-overlay-presenter.js';

// Word-timed line (WhisperX-like): each word carries a real range.
const TIMED: readonly TimedLine[] = [
  {
    id: 'L1',
    range: { startMs: 1000, endMs: 5000 },
    text: 'Hello brave world',
    words: [
      { text: 'Hello', range: { startMs: 1000, endMs: 2000 } },
      { text: 'brave', range: { startMs: 2000, endMs: 3500 } },
      { text: 'world', range: { startMs: 3500, endMs: 5000 } },
    ],
  },
];

// Sentence-only line (SRT-like): no word timings → interpolation.
const SENTENCE_ONLY: readonly TimedLine[] = [
  { id: 'S1', range: { startMs: 0, endMs: 3000 }, text: 'one two three' },
];

const drive = (
  lines: readonly TimedLine[],
  positions: readonly number[],
): { readonly states: OverlayViewState[]; readonly presenter: SubtitleOverlayPresenter } => {
  const bus = new EventBus();
  const presenter = new SubtitleOverlayPresenter(lines).connect(bus);
  const states: OverlayViewState[] = [];
  presenter.onChange((s) => states.push(s));
  let t = 0;
  for (const pos of positions) {
    bus.publish(createEvent('PositionChanged', { positionMs: pos }, (t += 1)));
  }
  return { states, presenter };
};

describe('SubtitleOverlayPresenter', () => {
  it('emits the active line and real word (not estimated) from bus events', () => {
    const { states } = drive(TIMED, [2500]);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      positionMs: 2500,
      lineId: 'L1',
      line: 'Hello brave world',
      word: 'brave',
      wordIndex: 1,
      estimated: false,
    });
  });

  it('flags interpolated words as estimated for sentence-only sources', () => {
    const { states } = drive(SENTENCE_ONLY, [500]);
    expect(states[0]).toMatchObject({
      line: 'one two three',
      word: 'one',
      estimated: true,
    });
  });

  it('clears line/word in a gap between cues', () => {
    const { states, presenter } = drive(TIMED, [8000]);
    expect(states[0]).toMatchObject({ line: null, word: null, estimated: false });
    expect(presenter.state.line).toBeNull();
  });

  it('exposes the latest state and stops updating after dispose', () => {
    const bus = new EventBus();
    const presenter = new SubtitleOverlayPresenter(TIMED).connect(bus);
    bus.publish(createEvent('PositionChanged', { positionMs: 1500 }, 1));
    expect(presenter.state.word).toBe('Hello');

    presenter.dispose();
    bus.publish(createEvent('PositionChanged', { positionMs: 4000 }, 2));
    expect(presenter.state.word).toBe('Hello'); // unchanged after dispose
    expect(bus.listenerCount('PositionChanged')).toBe(0);
  });

  it('stops delivering to an unsubscribed view listener', () => {
    const bus = new EventBus();
    const presenter = new SubtitleOverlayPresenter(TIMED).connect(bus);
    const seen: OverlayViewState[] = [];
    const off = presenter.onChange((s) => seen.push(s));
    bus.publish(createEvent('PositionChanged', { positionMs: 1500 }, 1));
    off();
    bus.publish(createEvent('PositionChanged', { positionMs: 2500 }, 2));
    expect(seen).toHaveLength(1);
  });

  it('rebinds cleanly when connect is called twice (no double delivery)', () => {
    const bus = new EventBus();
    const presenter = new SubtitleOverlayPresenter(TIMED).connect(bus).connect(bus);
    const seen: OverlayViewState[] = [];
    presenter.onChange((s) => seen.push(s));
    bus.publish(createEvent('PositionChanged', { positionMs: 1500 }, 1));
    expect(seen).toHaveLength(1); // not 2 — the first subscription was replaced
    expect(bus.listenerCount('PositionChanged')).toBe(1);
  });
});
