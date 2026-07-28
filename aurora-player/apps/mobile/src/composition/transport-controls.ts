import type { Unsubscribe } from '@aurora/domain';
import type { IPlayer, PlaybackState } from '@aurora/player-api';

// Headless brain for the player transport bar (play/pause · seek · progress ·
// time), so the device UI stays a thin control layer (plan/05 — no logic in
// `*.tsx`). Everything the chrome needs — "am I playing?", "how far along?",
// "what time is it?" — is derived here from the {@link IPlayer} port and pushed
// to the UI as an immutable {@link TransportState}; every action (toggle, seek,
// speed) is a guarded call on the same port. No React, no clock, no I/O, so the
// whole transport is Node-testable against `FakePlayer` — the missing "只能播放"
// pieces (暂停 / 进度条 / 时间) live in tested code, not in the view.

/** States in which a source is loaded and transport actions are meaningful. */
const LIVE_STATES: ReadonlySet<PlaybackState> = new Set<PlaybackState>([
  'ready',
  'playing',
  'paused',
  'ended',
]);

/** The immutable snapshot a transport bar renders. */
export interface TransportState {
  readonly state: PlaybackState;
  /** True only while actively playing (drives the play/pause icon). */
  readonly playing: boolean;
  /** True when a source is open, so play/seek are meaningful (enables the bar). */
  readonly canPlay: boolean;
  readonly positionMs: number;
  readonly durationMs: number;
  /** Playback fraction in `[0, 1]` for the seek bar; 0 when duration is unknown. */
  readonly progress: number;
}

/** Live playback position + transport actions for the player chrome. */
export interface TransportControls {
  /** The most recently computed snapshot. */
  state(): TransportState;
  /** Register a view listener; returns an unsubscribe handle. */
  subscribe(listener: (state: TransportState) => void): Unsubscribe;
  /** Play when paused/ready/ended, pause when playing (the one-button toggle). */
  togglePlay(): void;
  /** Start/resume playback (restarts from 0 when the media had ended). */
  play(): void;
  /** Pause playback. */
  pause(): void;
  /** Seek to an absolute position (clamped to `[0, duration]`). */
  seekTo(positionMs: number): void;
  /** Seek relative to the live position, e.g. ±10s skip buttons. */
  seekBy(deltaMs: number): void;
  /** Set playback rate (>0; 1 = normal). No-op for non-positive rates. */
  setSpeed(rate: number): void;
  /** Stop listening to the player and drop all view listeners. */
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Format a millisecond position as a clock string: `m:ss`, or `h:mm:ss` once the
 * media is an hour or longer. Pure — a UI helper for the time labels.
 */
export const formatClock = (ms: number): string => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const seconds = totalSec % 60;
  const minutes = Math.floor(totalSec / 60) % 60;
  const hours = Math.floor(totalSec / 3600);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};

/**
 * Build {@link TransportControls} bound to a live `player`. It reads position /
 * duration / state straight from the port on demand (never tracking a shadow
 * clock) and recomputes the snapshot whenever the player emits a lifecycle,
 * position or seek event — so the bar always reflects the real playhead.
 */
export const createTransportControls = (player: IPlayer): TransportControls => {
  const listeners = new Set<(state: TransportState) => void>();

  const snapshot = (): TransportState => {
    const state = player.state;
    const durationMs = player.duration();
    const positionMs = player.position();
    return {
      state,
      playing: state === 'playing',
      canPlay: LIVE_STATES.has(state),
      positionMs,
      durationMs,
      progress: durationMs > 0 ? clamp(positionMs / durationMs, 0, 1) : 0,
    };
  };

  const emit = (): void => {
    const next = snapshot();
    for (const listener of [...listeners]) {
      listener(next);
    }
  };

  // Any of these events can change what the bar shows; recompute + notify.
  const off = player.subscribe((event) => {
    if (
      event.type === 'positionChanged' ||
      event.type === 'stateChanged' ||
      event.type === 'seeked' ||
      event.type === 'opened' ||
      event.type === 'ended'
    ) {
      emit();
    }
  });

  const seekTo = (positionMs: number): void => {
    if (!LIVE_STATES.has(player.state)) {
      return;
    }
    void player.seek(clamp(positionMs, 0, player.duration()));
  };

  const play = (): void => {
    const state = player.state;
    if (state === 'ended') {
      // Restart: rewind to the head, then resume from a legal state.
      void player.seek(0).then(() => player.play());
      return;
    }
    if (state === 'ready' || state === 'paused') {
      void player.play();
    }
  };

  return {
    state: snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    togglePlay: () => {
      if (player.state === 'playing') {
        void player.pause();
      } else {
        play();
      }
    },
    play,
    pause: () => {
      if (player.state === 'playing') {
        void player.pause();
      }
    },
    seekTo,
    seekBy: (deltaMs) => seekTo(player.position() + deltaMs),
    setSpeed: (rate) => {
      if (rate > 0) {
        player.setSpeed(rate);
      }
    },
    dispose: () => {
      off();
      listeners.clear();
    },
  };
};
