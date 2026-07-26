import { describe, expect, it, vi } from 'vitest';
import type { IPlayer } from '@aurora/player-api';
import type { SubtitleDocument } from '@aurora/subtitle';
import { createLearningControls } from './learning-controls.js';

const DOC: SubtitleDocument = {
  meta: { format: 'srt' },
  lines: [
    {
      id: 'l1',
      range: { startMs: 1000, endMs: 4000 },
      text: 'Hello brave world',
      translated: '你好世界',
      words: [
        { text: 'Hello', range: { startMs: 1000, endMs: 1500 } },
        { text: 'brave', range: { startMs: 2000, endMs: 3000 } },
        { text: 'world', range: { startMs: 3000, endMs: 4000 } },
      ],
    },
    { id: 'l2', range: { startMs: 5000, endMs: 7000 }, text: 'good bye' },
  ],
  hasWordTimings: true,
};

// Minimal IPlayer double: only position()/seek() are exercised by the controls.
const makePlayer = (positionMs: number) => {
  const seek = vi.fn(() => Promise.resolve());
  const player = { position: () => positionMs, seek } as unknown as IPlayer;
  return { player, seek };
};

describe('createLearningControls · stepWord', () => {
  it('seeks to the next word and returns it', () => {
    const { player, seek } = makePlayer(2500);
    const step = createLearningControls(player, DOC).stepWord('next');
    expect(step?.word.text).toBe('world');
    expect(seek).toHaveBeenCalledWith(3000);
  });

  it('seeks to re-hear the current word on prev', () => {
    const { player, seek } = makePlayer(2500);
    const step = createLearningControls(player, DOC).stepWord('prev');
    expect(step?.word.text).toBe('brave');
    expect(seek).toHaveBeenCalledWith(2000);
  });

  it('does not seek at a boundary', () => {
    const { player, seek } = makePlayer(7000);
    expect(createLearningControls(player, DOC).stepWord('next')).toBeNull();
    expect(seek).not.toHaveBeenCalled();
  });
});

describe('createLearningControls · copy', () => {
  it('copies the active line, optionally with translation', () => {
    const { player } = makePlayer(2500);
    const controls = createLearningControls(player, DOC);
    expect(controls.copyActiveLineText()).toBe('Hello brave world');
    expect(controls.copyActiveLineText({ withTranslation: true })).toBe(
      'Hello brave world\n你好世界',
    );
  });

  it('returns null when the playhead is in a gap', () => {
    const { player } = makePlayer(4500);
    expect(createLearningControls(player, DOC).copyActiveLineText()).toBeNull();
  });

  it('copies the whole transcript', () => {
    const { player } = makePlayer(0);
    expect(createLearningControls(player, DOC).copyAllText()).toBe(
      'Hello brave world\ngood bye',
    );
  });
});
