import { EventBus, createEvent } from '@aurora/domain';
import type { IPlayer, MediaSource, PlayerEvent } from '@aurora/player-api';
import { SubtitleOverlayPresenter } from '@aurora/presentation';
import type { SubtitleDocument } from '@aurora/subtitle';
import type { NativeVideoSurface } from '../adapters/native-video-surface.js';
import { ReactNativeVideoPlayer } from '../adapters/react-native-video-player.js';
import { createLearningControls, type LearningControls } from './learning-controls.js';

export interface PlayerRuntimeDeps {
  /** The native `<Video>` surface (real on device, fake in tests). */
  readonly surface: NativeVideoSurface;
  /** Parsed subtitle document driving the overlay. */
  readonly document: SubtitleDocument;
  /** The media to open. */
  readonly media: MediaSource;
  /** Clock for event timestamps; injectable for deterministic tests. */
  readonly now?: () => number;
}

/**
 * The wired-up runtime returned by {@link createPlayerRuntime}. The App shell
 * only ever talks to this — never to the adapter or presenter directly.
 */
export interface PlayerRuntime {
  readonly player: IPlayer;
  readonly bus: EventBus;
  readonly presenter: SubtitleOverlayPresenter;
  /** Word-step seek + subtitle-copy gestures for the UI (Epic A). */
  readonly controls: LearningControls;
  /** Open the configured media (idle→ready). */
  open(): Promise<void>;
  /** Tear everything down. */
  dispose(): void;
}

/**
 * Composition root for the mobile app (plan/05 · DIP). It `new`s the concrete
 * objects from four packages and wires them so they collaborate ONLY through the
 * {@link IPlayer} port and the domain {@link EventBus}:
 *
 *   ReactNativeVideoPlayer --PlayerEvent--> (bridge) --PositionChanged-->
 *     EventBus --> SubtitleOverlayPresenter --> OverlayViewState --> UI
 *
 * This is the single place platform wiring is assembled; the pieces themselves
 * stay decoupled and independently testable. On a device the caller passes the
 * real `react-native-video` surface (see `src/ui/VideoScreen.example.tsx`); in
 * tests it passes `FakeNativeVideoSurface`.
 */
export const createPlayerRuntime = (deps: PlayerRuntimeDeps): PlayerRuntime => {
  const now = deps.now ?? (() => Date.now());
  const bus = new EventBus();
  const player = new ReactNativeVideoPlayer(deps.surface);
  const presenter = new SubtitleOverlayPresenter(deps.document.lines).connect(bus);
  const controls = createLearningControls(player, deps.document);

  // Adapter→domain bridge: translate player events onto the bus. This is the
  // only code that couples the two; the presenter never sees the player.
  const unbridge = player.subscribe((event: PlayerEvent) => {
    if (event.type === 'positionChanged') {
      bus.publish(
        createEvent('PositionChanged', { positionMs: event.positionMs }, now()),
      );
    } else if (event.type === 'opened') {
      bus.publish(
        createEvent(
          'MediaOpened',
          {
            mediaId: event.mediaId,
            durationMs: event.durationMs,
            tracks: event.tracks,
          },
          now(),
        ),
      );
    }
  });

  return {
    player,
    bus,
    presenter,
    controls,
    open: () => player.open(deps.media),
    dispose: () => {
      unbridge();
      presenter.dispose();
      player.dispose();
      bus.clear();
    },
  };
};
