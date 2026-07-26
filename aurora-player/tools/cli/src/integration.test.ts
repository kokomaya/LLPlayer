import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EventBus, createEvent } from '@aurora/domain';
import { FakePlayer, ManualClock, type MediaSource, type PlayerEvent } from '@aurora/player-api';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import { SubtitleTimeline, WordCursor } from '@aurora/timeline';
import { describe, expect, it } from 'vitest';

/**
 * Composition-root integration test (plan/09 · M2 slice A DoD): stand up the
 * real objects from four separate packages and let them collaborate ONLY
 * through the {@link FakePlayer} port and the domain {@link EventBus} — the
 * timeline and word cursor never touch the player directly, and the player
 * knows nothing about subtitles. The flow under test is:
 *
 *   FakePlayer --PlayerEvent--> bridge --PositionChanged--> EventBus
 *              --> SubtitleTimeline / WordCursor
 *
 * Assertions compare the observed line/word stream against the golden fixture.
 */
const SAMPLES = fileURLToPath(new URL('../../../samples/subtitles/', import.meta.url));
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

interface Snapshot {
  readonly positionMs: number;
  readonly line: string | null;
  readonly word: string | null;
  readonly estimated: boolean;
}

interface DriveResult {
  readonly snapshots: readonly Snapshot[];
  readonly openedMediaId: string | null;
  readonly positionEventCount: number;
}

/** Wire the packages together at the composition root and drive to the end. */
const drive = (doc: SubtitleDocument, stepMs: number): DriveResult => {
  const durationMs = doc.lines.reduce((m, l) => Math.max(m, l.range.endMs), 0);
  const clock = new ManualClock();
  const player = new FakePlayer({ clock });
  const bus = new EventBus();
  const timeline = new SubtitleTimeline(doc.lines);
  const words = new WordCursor(doc.lines);

  const snapshots: Snapshot[] = [];
  let openedMediaId: string | null = null;
  let positionEventCount = 0;

  // Domain consumer: reacts to bus events; this is the only code that drives the
  // timeline, and it is reached exclusively through the EventBus.
  bus.subscribe('MediaOpened', (e) => {
    openedMediaId = e.payload.mediaId;
  });
  bus.subscribe('PositionChanged', (e) => {
    positionEventCount += 1;
    const pos = e.payload.positionMs;
    const line = timeline.seek(pos).currentLine();
    const hit = words.currentWord(pos);
    snapshots.push({
      positionMs: pos,
      line: line ? line.text : null,
      word: hit ? hit.text : null,
      estimated: hit ? hit.estimated : false,
    });
  });

  // Adapter bridge: the player only ever speaks through its subscribe() port.
  player.subscribe((ev: PlayerEvent) => {
    if (ev.type === 'positionChanged') {
      bus.publish(createEvent('PositionChanged', { positionMs: ev.positionMs }, clock.now()));
    } else if (ev.type === 'opened') {
      bus.publish(
        createEvent(
          'MediaOpened',
          { mediaId: ev.mediaId, durationMs: ev.durationMs, tracks: ev.tracks },
          clock.now(),
        ),
      );
    }
  });

  const source: MediaSource = { id: 'movie.mkv', uri: 'movie.mkv', durationMs };
  void player.open(source);
  void player.play();
  const guard = Math.ceil(durationMs / stepMs) + 2;
  for (let i = 0; i < guard && player.state === 'playing'; i += 1) {
    clock.advance(stepMs);
    player.tick();
  }
  player.dispose();

  return { snapshots, openedMediaId, positionEventCount };
};

const wordAt = (r: DriveResult, positionMs: number): Snapshot =>
  r.snapshots.find((s) => s.positionMs === positionMs)!;

describe('composition-root integration: player → events → timeline', () => {
  it('opens media and emits a PositionChanged stream over the bus', () => {
    const r = drive(load('basic.whisperx.json'), 1000);
    expect(r.openedMediaId).toBe('movie.mkv');
    expect(r.positionEventCount).toBe(r.snapshots.length);
    expect(r.positionEventCount).toBeGreaterThan(1);
    expect(r.snapshots.at(-1)!.positionMs).toBe(35000); // golden duration
  });

  it('word-timed source yields real (non-estimated) words matching the golden', () => {
    const r = drive(load('basic.whisperx.json'), 1000);
    // Golden line 3 "3. I'm fine": "3." 20.0–20.4, "I'm" 20.4–22.0, "fine" 22.0–25.0.
    expect(wordAt(r, 20000)).toMatchObject({ line: "3. I'm fine", word: '3.', estimated: false });
    expect(wordAt(r, 21000)).toMatchObject({ line: "3. I'm fine", word: "I'm", estimated: false });
    expect(wordAt(r, 23000)).toMatchObject({ line: "3. I'm fine", word: 'fine', estimated: false });
    // In the gap between lines 3 and 4 nothing is showing.
    expect(wordAt(r, 26000)).toMatchObject({ line: null, word: null });
  });

  it('degrades to estimated words for a sentence-only source', () => {
    const r = drive(load('basic.srt'), 1000);
    const s = wordAt(r, 2000); // inside "1. Hello World!" (1000–5000)
    expect(s.line).toBe('1. Hello World!');
    expect(s.word).not.toBeNull();
    expect(s.estimated).toBe(true);
  });

  it('the SRT and WhisperX golden fixtures agree on the active line at every tick', () => {
    const srt = drive(load('basic.srt'), 1000);
    const wx = drive(load('basic.whisperx.json'), 1000);
    expect(srt.snapshots.map((s) => s.line)).toEqual(wx.snapshots.map((s) => s.line));
  });
});
