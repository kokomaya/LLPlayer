import { EventBus, createEvent } from '@aurora/domain';
import type { IPlayer, MediaSource, PlayerEvent } from '@aurora/player-api';
import {
  SubtitleListPresenter,
  SubtitleOverlayPresenter,
  type SubtitleDisplayMode,
} from '@aurora/presentation';
import type { SubtitleDocument } from '@aurora/subtitle';
import type { NativeVideoSurface } from '../adapters/native-video-surface.js';
import { ReactNativeVideoPlayer } from '../adapters/react-native-video-player.js';
import { createLearningControls, type LearningControls } from './learning-controls.js';
import {
  createSubtitleWordActions,
  type SubtitleWordActions,
  type WordFavorite,
  type WordLookup,
} from './subtitle-word-actions.js';
import { createTransportControls, type TransportControls } from './transport-controls.js';

export interface PlayerRuntimeDeps {
  /** The native `<Video>` surface (real on device, fake in tests). */
  readonly surface: NativeVideoSurface;
  /** Parsed subtitle document driving the overlay. */
  readonly document: SubtitleDocument;
  /** The media to open. */
  readonly media: MediaSource;
  /** Clock for event timestamps; injectable for deterministic tests. */
  readonly now?: () => number;
  /** Initial subtitle-list layout mode (list ↔ fullscreen). Default `list`. */
  readonly subtitleMode?: SubtitleDisplayMode;
  /** How many source lines fullscreen shows (a wrapped line counts as one). */
  readonly subtitleLineCount?: number;
  /**
   * Dictionary lookup for the word menu (翻译/示例). Injected as a function-port
   * by the App shell so this runtime never imports `@aurora/dictionary`; when
   * absent the menu simply hides those actions.
   */
  readonly wordLookup?: WordLookup;
  /**
   * Vocabulary sink for the word menu (收藏). Injected as a function-port by the
   * App shell so this runtime never imports `@aurora/learning`; when absent the
   * menu hides 收藏.
   */
  readonly wordFavorite?: WordFavorite;
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
  /** Play/pause · seek · progress · time state for the transport bar (Epic A). */
  readonly transport: TransportControls;
  /**
   * Word-addressable subtitle surface for portrait-list & fullscreen modes
   * (Epic A). Position-driven; the UI renders its view-state and forwards taps
   * to {@link PlayerRuntime.wordActions}.
   */
  readonly subtitleList: SubtitleListPresenter;
  /** Tap→seek / long-press→menu (翻译/收藏/示例) for subtitle words (Epic A/B). */
  readonly wordActions: SubtitleWordActions;
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
  const transport = createTransportControls(player);
  // Build options with only the provided keys — `exactOptionalPropertyTypes`
  // rejects an explicit `undefined` for an optional field, so we spread instead.
  const subtitleList = new SubtitleListPresenter(deps.document.lines, {
    ...(deps.subtitleMode !== undefined && { mode: deps.subtitleMode }),
    ...(deps.subtitleLineCount !== undefined && { lineCount: deps.subtitleLineCount }),
  }).connect(bus);
  const wordActions = createSubtitleWordActions({
    player,
    ...(deps.wordLookup !== undefined && { lookup: deps.wordLookup }),
    ...(deps.wordFavorite !== undefined && { favorite: deps.wordFavorite }),
  });

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
    transport,
    subtitleList,
    wordActions,
    open: () => player.open(deps.media),
    dispose: () => {
      unbridge();
      subtitleList.dispose();
      transport.dispose();
      presenter.dispose();
      player.dispose();
      bus.clear();
    },
  };
};
