/**
 * The seam between the pure {@link ReactNativeVideoPlayer} adapter core and the
 * `react-native-video` `<Video>` component (plan/04 · Ports & Adapters). The
 * core issues {@link NativeVideoCommands} to the imperative video handle and
 * reacts to {@link NativeVideoCallbacks} the component fires — but it never
 * imports `react-native-video` itself. The real binding
 * (`src/ui/VideoScreen.example.tsx`) implements this surface; tests implement it
 * with `FakeNativeVideoSurface`.
 *
 * All times mirror `react-native-video`'s own convention: **seconds**, not ms.
 * Converting to the ms the domain uses is the adapter core's job.
 */

/** Imperative commands the core sends to the native `<Video>` handle. */
export interface NativeVideoCommands {
  /** Point the player at a URI; the component responds by firing `onLoad`. */
  load(uri: string): void;
  /** Begin/resume playback (`paused={false}`). */
  play(): void;
  /** Pause playback (`paused={true}`). */
  pause(): void;
  /** Seek to an absolute position in **seconds**; responds with `onSeek`. */
  seek(positionSec: number): void;
  /** Set the playback rate (1 = normal). */
  setRate(rate: number): void;
  /** Release the underlying player. */
  release(): void;
}

/**
 * Callbacks the native `<Video>` invokes. Field shapes are the subset of
 * `react-native-video`'s event payloads the adapter actually consumes.
 */
export interface NativeVideoCallbacks {
  /** Media loaded; `duration`/`currentTime` in seconds. */
  onLoad(event: { readonly duration: number; readonly currentTime?: number }): void;
  /** Progress tick while playing; `currentTime` in seconds. */
  onProgress(event: { readonly currentTime: number }): void;
  /** A requested seek completed; `currentTime` in seconds. */
  onSeek(event: { readonly currentTime: number; readonly seekTime?: number }): void;
  /** Playback reached the end of media. */
  onEnd(): void;
  /** A decoding/network error occurred. */
  onError(event: { readonly error: { readonly errorString?: string } }): void;
  /** Play/pause state hint from the OS (Media3/ExoPlayer). Advisory only. */
  onPlaybackStateChanged(event: { readonly isPlaying: boolean }): void;
  /** Buffering hint. Advisory only. */
  onBuffer(event: { readonly isBuffering: boolean }): void;
}

/** Handle unbinding a set of callbacks from the surface. */
export type UnbindCallbacks = () => void;

/**
 * A bound native video handle: the adapter core drives {@link commands} and
 * subscribes to callbacks via {@link bind}.
 */
export interface NativeVideoSurface {
  readonly commands: NativeVideoCommands;
  bind(callbacks: NativeVideoCallbacks): UnbindCallbacks;
}
