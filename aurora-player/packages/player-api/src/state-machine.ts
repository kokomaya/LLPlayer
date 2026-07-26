import { ValidationError, err, ok, type Result } from '@aurora/domain';
import type { PlaybackState } from './model.js';

/**
 * The lifecycle actions that drive {@link PlaybackStateMachine}. These are the
 * *causes* of a state change, distinct from the {@link PlayerEvent}s a player
 * emits as a consequence.
 *
 * - `open`       — begin loading a source.
 * - `opened`     — the source loaded and is ready.
 * - `openFailed` — loading failed.
 * - `play`       — start/resume playback.
 * - `pause`      — pause playback.
 * - `seek`       — reposition (see the seek note below).
 * - `end`        — playback reached the end of media.
 * - `fail`       — a runtime error occurred.
 * - `dispose`    — tear the player down.
 */
export type PlayerAction =
  | 'open'
  | 'opened'
  | 'openFailed'
  | 'play'
  | 'pause'
  | 'seek'
  | 'end'
  | 'fail'
  | 'dispose';

export interface StateTransition {
  readonly from: PlaybackState;
  readonly to: PlaybackState;
}

/**
 * The legal transition table (plan/03 §4). `undefined` for a (state, action)
 * pair means the action is illegal from that state.
 *
 * Seek note: the plan diagram draws `Playing --seek--> Ready`, but that edge
 * models the transient buffering of a *real* decoder. The durable contract the
 * plan actually mandates is that `seeking`/`seeked` events fire. We therefore
 * keep the play/pause distinction across a seek — `playing` stays `playing`
 * (resume-after-seek is what word-sync/loops expect), while `paused`/`ended`
 * settle into `ready` at the new position. `fail` and `dispose` are legal from
 * every non-terminal state (`any --> Idle: dispose()`).
 */
const TABLE: Readonly<
  Record<PlaybackState, Partial<Record<PlayerAction, PlaybackState>>>
> = {
  idle: { open: 'opening', dispose: 'idle' },
  opening: { opened: 'ready', openFailed: 'error', fail: 'error', dispose: 'idle' },
  ready: { play: 'playing', seek: 'ready', fail: 'error', dispose: 'idle' },
  playing: {
    pause: 'paused',
    seek: 'playing',
    end: 'ended',
    fail: 'error',
    dispose: 'idle',
  },
  paused: { play: 'playing', seek: 'ready', fail: 'error', dispose: 'idle' },
  ended: { seek: 'ready', fail: 'error', dispose: 'idle' },
  error: { open: 'opening', dispose: 'idle' },
};

/** States from which a media is loaded and a seek is meaningful. */
export const canSeekFrom = (state: PlaybackState): boolean =>
  TABLE[state].seek !== undefined;

/**
 * A pure, platform-agnostic playback state machine. It validates transitions and
 * reports the resulting state; it emits nothing and knows nothing about time,
 * position, or media — that belongs to the {@link IPlayer} implementation.
 */
export class PlaybackStateMachine {
  #state: PlaybackState;

  constructor(initial: PlaybackState = 'idle') {
    this.#state = initial;
  }

  get state(): PlaybackState {
    return this.#state;
  }

  /** Whether `action` is legal from the current state. */
  can(action: PlayerAction): boolean {
    return TABLE[this.#state][action] !== undefined;
  }

  /** The state `action` would lead to, or `undefined` if it is illegal. */
  peek(action: PlayerAction): PlaybackState | undefined {
    return TABLE[this.#state][action];
  }

  /**
   * Apply `action`. On success the internal state advances and the transition is
   * returned; an illegal action leaves the state untouched and returns an error
   * (illegal *API usage*, distinct from an operational `fail`/`error` event).
   */
  dispatch(action: PlayerAction): Result<StateTransition, ValidationError> {
    const to = TABLE[this.#state][action];
    if (to === undefined) {
      return err(
        new ValidationError(
          `Illegal player transition: cannot "${action}" from "${this.#state}"`,
        ),
      );
    }
    const from = this.#state;
    this.#state = to;
    return ok({ from, to });
  }
}
