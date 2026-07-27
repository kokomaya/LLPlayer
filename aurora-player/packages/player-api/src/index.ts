// player-api: a platform-agnostic IPlayer port + playback state machine
// (plan/05 · player-api). No decoding/rendering — that lives in adapters
// injected at the composition root. Zero platform dependencies.

export * from './model.js';
export * from './clock.js';
export * from './port.js';
export * from './source-kind.js';
export * from './resolve-source.js';
export {
  PlaybackStateMachine,
  canSeekFrom,
  type PlayerAction,
  type StateTransition,
} from './state-machine.js';
export { FakePlayer, type FakePlayerOptions } from './fake-player.js';
