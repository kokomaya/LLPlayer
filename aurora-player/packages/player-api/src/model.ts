/**
 * Platform-agnostic player model (plan/05 · player-api). These are pure data
 * shapes; the decoding/rendering lives in platform adapters that implement
 * {@link IPlayer} at the composition root.
 */

/**
 * The playback lifecycle states (plan/03 §4). A convergence of FlyleafLib's
 * `Status` (`Opening/Failed/Stopped/Paused/Playing/Ended`): `Stopped`→`idle`,
 * `Failed`→`error`, plus an explicit `ready` (media loaded, not yet playing).
 */
export type PlaybackState =
  | 'idle'
  | 'opening'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error';

/** A media track descriptor discovered when a source is opened. */
export interface TrackInfo {
  readonly id: string;
  readonly kind: 'audio' | 'video' | 'subtitle';
  readonly language?: string;
  readonly label?: string;
}

/**
 * What to open. A real adapter discovers `durationMs`/`tracks` from the
 * container; they are optional here so a manifest (or the {@link FakePlayer})
 * can supply them up front. `id` identifies the media across events.
 */
export interface MediaSource {
  readonly id: string;
  readonly uri: string;
  readonly title?: string;
  /** Total length if known before opening; the FakePlayer treats it as truth. */
  readonly durationMs?: number;
  readonly tracks?: readonly TrackInfo[];
  /**
   * Extra HTTP headers a networked player must send when fetching {@link uri}
   * (e.g. `Authorization: Bearer …` for a token-gated catalog server). Optional
   * and platform-agnostic: local sources and the {@link FakePlayer} ignore it; a
   * streaming adapter (react-native-video's `source.headers`) applies it. Set at
   * the composition root — never baked into a package (rule ①.E: no credentials
   * in catalog data).
   */
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * The player's outbound notifications (plan/05 · player-api). A single
 * discriminated union rather than a bag of callbacks, so subscribers switch on
 * `type` with full type-safety. `seeking`/`seeked` are exposed explicitly for
 * word-level sync and A-B loops (plan/03 §4 note).
 */
export type PlayerEvent =
  | {
      readonly type: 'opened';
      readonly mediaId: string;
      readonly durationMs: number;
      readonly tracks: readonly TrackInfo[];
    }
  | {
      readonly type: 'stateChanged';
      readonly from: PlaybackState;
      readonly to: PlaybackState;
    }
  | { readonly type: 'positionChanged'; readonly positionMs: number }
  | { readonly type: 'seeking'; readonly positionMs: number }
  | { readonly type: 'seeked'; readonly positionMs: number }
  | { readonly type: 'ended' }
  | { readonly type: 'error'; readonly message: string };

export type PlayerEventType = PlayerEvent['type'];

/** Narrow a {@link PlayerEvent} to a specific variant. */
export type PlayerEventOf<K extends PlayerEventType> = Extract<
  PlayerEvent,
  { type: K }
>;

export type PlayerListener = (event: PlayerEvent) => void;
