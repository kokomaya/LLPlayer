import { EventBus, createEvent } from '@aurora/domain';
import {
  FakePlayer,
  ManualClock,
  type MediaSource,
  type PlayerEvent,
} from '@aurora/player-api';
import { flattenText, type SubtitleDocument } from '@aurora/subtitle';
import { SubtitleTimeline, WordCursor } from '@aurora/timeline';

export interface PlaybackOptions {
  /** Playback rate (>0). Defaults to 1. */
  readonly speed?: number;
  /** Logical ms advanced per driver tick. Defaults to 1000. */
  readonly stepMs?: number;
}

/** One printed playback frame. */
export interface Frame {
  readonly positionMs: number;
  readonly line: string | null;
  readonly word: string | null;
  readonly estimated: boolean;
}

/**
 * Composition root for `play` (plan/05 · DIP). Wires the pieces together at the
 * edge and lets them collaborate purely through ports and events:
 *
 *   FakePlayer --PlayerEvent--> (bridge) --PositionChanged--> EventBus
 *              --> timeline + word cursor --> Frame
 *
 * The {@link FakePlayer} derives position from an injected {@link ManualClock},
 * so the whole run is deterministic: advance the clock, `tick()`, repeat. No
 * real media is decoded — duration is taken from the subtitle document — which
 * is what lets this run in pure Node.
 *
 * `open`/`play` are declared `async` on {@link FakePlayer} to honour the real
 * `IPlayer` contract, but do no awaited work, so their effects complete
 * synchronously here; the clock-driven loop below stays synchronous.
 */
export const runPlayback = (
  doc: SubtitleDocument,
  mediaId: string,
  options: PlaybackOptions,
  emit: (frame: Frame) => void,
): void => {
  const durationMs = doc.lines.reduce((m, l) => Math.max(m, l.range.endMs), 0);
  if (durationMs <= 0) {
    return; // nothing to play
  }

  const clock = new ManualClock();
  const player = new FakePlayer({ clock });
  const bus = new EventBus();
  const timeline = new SubtitleTimeline(doc.lines);
  const words = new WordCursor(doc.lines);

  // Domain-side consumer: react to PositionChanged by advancing the cursors and
  // emitting a frame. This is the only thing that knows about the timeline.
  bus.subscribe('PositionChanged', (event) => {
    const positionMs = event.payload.positionMs;
    const line = timeline.seek(positionMs).currentLine();
    const hit = words.currentWord(positionMs);
    emit({
      positionMs,
      line: line ? flattenText(line.text) : null,
      word: hit ? hit.text : null,
      estimated: hit ? hit.estimated : false,
    });
  });

  // Adapter-side bridge: translate player events into domain events on the bus.
  player.subscribe((ev: PlayerEvent) => {
    if (ev.type === 'positionChanged') {
      bus.publish(
        createEvent('PositionChanged', { positionMs: ev.positionMs }, clock.now()),
      );
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

  const source: MediaSource = { id: mediaId, uri: mediaId, durationMs };
  void player.open(source);
  if (options.speed !== undefined) {
    player.setSpeed(options.speed);
  }
  void player.play();

  const stepMs = options.stepMs && options.stepMs > 0 ? options.stepMs : 1000;
  const speed = options.speed && options.speed > 0 ? options.speed : 1;
  // Bound iterations so a bad speed/step can never loop forever.
  const maxFrames = Math.ceil(durationMs / (stepMs * speed)) + 2;
  for (let i = 0; i < maxFrames && player.state === 'playing'; i += 1) {
    clock.advance(stepMs);
    player.tick();
  }

  player.dispose();
};

/** Renders a {@link Frame} as a single human-readable line. */
export const formatFrame = (f: Frame): string => {
  const line = f.line !== null ? f.line : '(no subtitle)';
  const word =
    f.word !== null ? ` | word: ${f.word}${f.estimated ? '~' : ''}` : '';
  return `@ ${f.positionMs}ms  ▶ ${line}${word}`;
};
