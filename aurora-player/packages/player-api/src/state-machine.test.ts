import { describe, expect, it } from 'vitest';
import { PlaybackStateMachine, canSeekFrom } from './state-machine.js';
import type { PlaybackState } from './model.js';

describe('PlaybackStateMachine', () => {
  it('starts idle', () => {
    expect(new PlaybackStateMachine().state).toBe('idle');
  });

  it('walks the happy path idle→opening→ready→playing→paused→playing→ended', () => {
    const m = new PlaybackStateMachine();
    expect(m.dispatch('open').ok).toBe(true);
    expect(m.state).toBe('opening');
    m.dispatch('opened');
    expect(m.state).toBe('ready');
    m.dispatch('play');
    expect(m.state).toBe('playing');
    m.dispatch('pause');
    expect(m.state).toBe('paused');
    m.dispatch('play');
    expect(m.state).toBe('playing');
    m.dispatch('end');
    expect(m.state).toBe('ended');
  });

  it('rejects illegal transitions without changing state', () => {
    const m = new PlaybackStateMachine();
    const r = m.dispatch('play'); // can't play from idle
    expect(r.ok).toBe(false);
    expect(m.state).toBe('idle');
  });

  it('reports the failed-open path', () => {
    const m = new PlaybackStateMachine();
    m.dispatch('open');
    m.dispatch('openFailed');
    expect(m.state).toBe('error');
    // recover: open may be retried from error
    expect(m.can('open')).toBe(true);
  });

  it('seek keeps playing but re-arms paused/ended to ready', () => {
    const fromPlaying = new PlaybackStateMachine('playing');
    expect(fromPlaying.dispatch('seek').ok).toBe(true);
    expect(fromPlaying.state).toBe('playing');

    const fromPaused = new PlaybackStateMachine('paused');
    fromPaused.dispatch('seek');
    expect(fromPaused.state).toBe('ready');

    const fromEnded = new PlaybackStateMachine('ended');
    fromEnded.dispatch('seek');
    expect(fromEnded.state).toBe('ready');
  });

  it('dispose from any state returns to idle', () => {
    const states: PlaybackState[] = [
      'idle',
      'opening',
      'ready',
      'playing',
      'paused',
      'ended',
      'error',
    ];
    for (const s of states) {
      const m = new PlaybackStateMachine(s);
      m.dispatch('dispose');
      expect(m.state).toBe('idle');
    }
  });

  it('fail moves every non-terminal state to error', () => {
    for (const s of ['opening', 'ready', 'playing', 'paused', 'ended'] as const) {
      const m = new PlaybackStateMachine(s);
      expect(m.dispatch('fail').ok).toBe(true);
      expect(m.state).toBe('error');
    }
  });

  it('peek reports the target without mutating', () => {
    const m = new PlaybackStateMachine('ready');
    expect(m.peek('play')).toBe('playing');
    expect(m.peek('end')).toBeUndefined();
    expect(m.state).toBe('ready');
  });

  it('canSeekFrom matches media-loaded states', () => {
    expect(canSeekFrom('ready')).toBe(true);
    expect(canSeekFrom('playing')).toBe(true);
    expect(canSeekFrom('paused')).toBe(true);
    expect(canSeekFrom('ended')).toBe(true);
    expect(canSeekFrom('idle')).toBe(false);
    expect(canSeekFrom('opening')).toBe(false);
    expect(canSeekFrom('error')).toBe(false);
  });
});
