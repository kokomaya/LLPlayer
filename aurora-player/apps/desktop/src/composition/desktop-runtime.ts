import { EventBus, createEvent } from '@aurora/domain';
import type { IPlayer, MediaSource, PlayerEvent } from '@aurora/player-api';
import { SubtitleOverlayPresenter } from '@aurora/presentation';
import type { SubtitleDocument } from '@aurora/subtitle';
import type { DesktopVideoSurface } from '../adapters/desktop-video-surface.js';
import { MpvPlayer } from '../adapters/mpv-player.js';

export interface DesktopRuntimeDeps {
  /** The libmpv surface (real over Tauri IPC on device, fake in tests). */
  readonly surface: DesktopVideoSurface;
  /** Parsed subtitle document driving the overlay. */
  readonly document: SubtitleDocument;
  /** The media to open. */
  readonly media: MediaSource;
  /** Clock for event timestamps; injectable for deterministic tests. */
  readonly now?: () => number;
}

/**
 * The wired-up runtime returned by {@link createDesktopRuntime}. The Tauri UI
 * shell only ever talks to this — never to the adapter or presenter directly.
 */
export interface DesktopRuntime {
  readonly player: IPlayer;
  readonly bus: EventBus;
  readonly presenter: SubtitleOverlayPresenter;
  /** Open the configured media (idle→ready). */
  open(): Promise<void>;
  /** Tear everything down. */
  dispose(): void;
}

/**
 * Composition root for the desktop app (plan/05 · DIP). It is the OCP twin of
 * mobile's `createPlayerRuntime`: identical wiring, only the concrete adapter
 * differs ({@link MpvPlayer} instead of `ReactNativeVideoPlayer`). Everything
 * downstream — the EventBus bridge and the SHARED `SubtitleOverlayPresenter`
 * from `@aurora/presentation` — is reused unchanged:
 *
 *   MpvPlayer --PlayerEvent--> (bridge) --PositionChanged-->
 *     EventBus --> SubtitleOverlayPresenter --> OverlayViewState --> UI
 *
 * On a machine the caller passes the real libmpv surface (see
 * `src/ui/tauri-mpv-surface.example.ts`); in tests it passes
 * `FakeDesktopVideoSurface`.
 */
export const createDesktopRuntime = (deps: DesktopRuntimeDeps): DesktopRuntime => {
  const now = deps.now ?? (() => Date.now());
  const bus = new EventBus();
  const player = new MpvPlayer(deps.surface);
  const presenter = new SubtitleOverlayPresenter(deps.document.lines).connect(bus);

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
    open: () => player.open(deps.media),
    dispose: () => {
      unbridge();
      presenter.dispose();
      player.dispose();
      bus.clear();
    },
  };
};
