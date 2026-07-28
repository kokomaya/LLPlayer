import type { MediaSource } from '@aurora/player-api';
import type { OverlayViewState } from '@aurora/presentation';
import type { SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import { FakeNativeVideoSurface } from '../adapters/fake-native-video-surface.js';
import { createPlayerRuntime } from './player-runtime.js';

const DOC: SubtitleDocument = {
  meta: { format: 'whisperx-json', title: 'clip' },
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
    { id: '2', range: { startMs: 8000, endMs: 10_000 }, text: 'bye now' },
  ],
};

const MEDIA: MediaSource = { id: 'clip', uri: 'media://clip', durationMs: 10_000 };

const run = (
  doc: SubtitleDocument,
  stepMs = 1000,
): { readonly states: OverlayViewState[]; readonly openedMediaId: string | null } => {
  const surface = new FakeNativeVideoSurface({ durationSec: 10 });
  let tick = 0;
  const runtime = createPlayerRuntime({
    surface,
    document: doc,
    media: MEDIA,
    now: () => (tick += 1),
  });

  const states: OverlayViewState[] = [];
  runtime.presenter.onChange((s) => states.push(s));
  let openedMediaId: string | null = null;
  runtime.bus.subscribe('MediaOpened', (e) => {
    openedMediaId = e.payload.mediaId;
  });

  void runtime.open();
  void runtime.player.play();
  for (let i = 0; i < 100 && runtime.player.state === 'playing'; i += 1) {
    surface.advance(stepMs);
  }
  runtime.dispose();
  return { states, openedMediaId };
};

describe('createPlayerRuntime', () => {
  it('wires player→bus→presenter and drives the overlay to the end', () => {
    const { states, openedMediaId } = run(DOC);
    expect(openedMediaId).toBe('clip');
    expect(states.length).toBeGreaterThan(1);
    expect(states.at(-1)!.positionMs).toBe(10_000);
  });

  it('reports the real spoken word at each position', () => {
    const { states } = run(DOC);
    const at2000 = states.find((s) => s.positionMs === 2000)!;
    expect(at2000).toMatchObject({ line: 'Hello world', word: 'Hello', estimated: false });
    const at4000 = states.find((s) => s.positionMs === 4000)!;
    expect(at4000.word).toBe('world');
  });

  it('shows no subtitle in the gap between cues', () => {
    const { states } = run(DOC);
    const at6000 = states.find((s) => s.positionMs === 6000)!;
    expect(at6000).toMatchObject({ line: null, word: null });
  });
});

describe('createPlayerRuntime · subtitle list + word actions', () => {
  it('drives the word-addressable list from the same bus and honours mode/count', () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10 });
    const runtime = createPlayerRuntime({
      surface,
      document: DOC,
      media: MEDIA,
      subtitleMode: 'fullscreen',
      subtitleLineCount: 1,
      now: () => 0,
    });

    expect(runtime.subtitleList.lines.map((l) => l.id)).toEqual(['1', '2']);
    expect(runtime.subtitleList.state.mode).toBe('fullscreen');

    void runtime.open();
    void runtime.player.play();
    surface.advance(2000); // inside line 1, word "Hello"
    expect(runtime.subtitleList.state.activeLineIndex).toBe(0);
    expect(runtime.subtitleList.state.visibleRange).toEqual({ start: 0, end: 1 });

    runtime.dispose();
  });

  it('seeks the player to a tapped word and hides menu actions when no ports are wired', () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10 });
    const runtime = createPlayerRuntime({ surface, document: DOC, media: MEDIA, now: () => 0 });

    expect(runtime.wordActions.canTranslate).toBe(false);
    expect(runtime.wordActions.canFavorite).toBe(false);

    const word = runtime.subtitleList.lines[0]!.words[1]!; // "world" @ 3000
    void runtime.open();
    runtime.wordActions.seekToWord(word);
    expect(runtime.player.position()).toBe(word.targetMs);

    runtime.dispose();
  });

  it('exposes injected dictionary/vocabulary ports through the word menu', async () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10 });
    const saved: { word: string; example?: string }[] = [];
    const runtime = createPlayerRuntime({
      surface,
      document: DOC,
      media: MEDIA,
      now: () => 0,
      wordLookup: async (w) => ({ headword: w, senses: [{ definition: 'x', examples: [`${w}!`] }] }),
      wordFavorite: async (input) => {
        saved.push(input);
      },
    });

    expect(runtime.wordActions.canTranslate).toBe(true);
    expect(runtime.wordActions.canFavorite).toBe(true);

    const word = runtime.subtitleList.lines[0]!.words[0]!; // "Hello"
    const menu = runtime.wordActions.openMenu(word);
    expect(await menu.examples()).toEqual(['Hello!']);
    expect(await menu.favorite({ lineText: 'Hello world' })).toBe(true);
    expect(saved).toEqual([{ word: 'Hello', example: 'Hello world' }]);

    runtime.dispose();
  });
});
