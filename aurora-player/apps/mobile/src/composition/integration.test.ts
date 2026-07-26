import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MediaSource } from '@aurora/player-api';
import type { OverlayViewState } from '@aurora/presentation';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import { describe, expect, it } from 'vitest';
import { FakeNativeVideoSurface } from '../adapters/fake-native-video-surface.js';
import { createPlayerRuntime } from './player-runtime.js';

/**
 * Composition-root integration test for the mobile app (plan/09 · M2 DoD). It
 * stands up the REAL objects — the Android {@link ReactNativeVideoPlayer} core
 * (behind {@link FakeNativeVideoSurface}), the domain EventBus, the subtitle
 * parser, and the timeline/word cursors inside the presenter — and lets them
 * collaborate only through the player port and the bus:
 *
 *   FakeNativeVideoSurface --native cb--> ReactNativeVideoPlayer
 *     --PlayerEvent--> (bridge) --PositionChanged--> EventBus
 *     --> SubtitleOverlayPresenter --> OverlayViewState
 *
 * The observed overlay stream is checked against the golden subtitle fixtures.
 */
const SAMPLES = fileURLToPath(
  new URL('../../../../samples/subtitles/', import.meta.url),
);

const load = (file: string): SubtitleDocument => {
  const parsed = createDefaultRegistry().parse({
    content: readFileSync(`${SAMPLES}${file}`, 'utf8'),
    filename: file,
  });
  if (!parsed.ok) {
    throw parsed.error;
  }
  return parsed.value;
};

interface DriveResult {
  readonly states: readonly OverlayViewState[];
  readonly openedMediaId: string | null;
}

const drive = (doc: SubtitleDocument, stepMs = 1000): DriveResult => {
  const durationMs = doc.lines.reduce((m, l) => Math.max(m, l.range.endMs), 0);
  const surface = new FakeNativeVideoSurface({ durationSec: durationMs / 1000 });
  const media: MediaSource = { id: 'movie.mkv', uri: 'media://movie.mkv', durationMs };
  let tick = 0;
  const runtime = createPlayerRuntime({
    surface,
    document: doc,
    media,
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
  const guard = Math.ceil(durationMs / stepMs) + 2;
  for (let i = 0; i < guard && runtime.player.state === 'playing'; i += 1) {
    surface.advance(stepMs);
  }
  runtime.dispose();
  return { states, openedMediaId };
};

const stateAt = (r: DriveResult, positionMs: number): OverlayViewState =>
  r.states.find((s) => s.positionMs === positionMs)!;

describe('mobile composition root: native surface → events → overlay', () => {
  it('opens media and streams overlay updates to the end', () => {
    const r = drive(load('basic.whisperx.json'));
    expect(r.openedMediaId).toBe('movie.mkv');
    expect(r.states.length).toBeGreaterThan(1);
    expect(r.states.at(-1)!.positionMs).toBe(35000);
  });

  it('renders real (non-estimated) words from a word-timed source', () => {
    const r = drive(load('basic.whisperx.json'));
    // Golden line 3 "3. I'm fine": "3." 20.0–20.4, "I'm" 20.4–22.0, "fine" 22.0–25.0.
    expect(stateAt(r, 20000)).toMatchObject({ line: "3. I'm fine", word: '3.', estimated: false });
    expect(stateAt(r, 21000)).toMatchObject({ line: "3. I'm fine", word: "I'm", estimated: false });
    expect(stateAt(r, 23000)).toMatchObject({ line: "3. I'm fine", word: 'fine', estimated: false });
    expect(stateAt(r, 26000)).toMatchObject({ line: null, word: null });
  });

  it('degrades to estimated words for a sentence-only source', () => {
    const r = drive(load('basic.srt'));
    const s = stateAt(r, 2000); // inside "1. Hello World!" (1000–5000)
    expect(s.line).toBe('1. Hello World!');
    expect(s.word).not.toBeNull();
    expect(s.estimated).toBe(true);
  });

  it('SRT and WhisperX goldens agree on the active line at every tick', () => {
    const srt = drive(load('basic.srt'));
    const wx = drive(load('basic.whisperx.json'));
    expect(srt.states.map((s) => s.line)).toEqual(wx.states.map((s) => s.line));
  });
});
