import { describe, expect, it, vi } from 'vitest';
import { ManualClock } from './clock.js';
import { runPlayerContract, type PlayerTestHarness } from './contract/player-contract.js';
import { FakePlayer } from './fake-player.js';
import type { MediaSource, PlayerEvent } from './model.js';

const SOURCE: MediaSource = {
  id: 'm1',
  uri: 'fake://m1',
  durationMs: 10_000,
  tracks: [
    { id: 'v1', kind: 'video' },
    { id: 'a1', kind: 'audio', language: 'en' },
  ],
};

const makeHarness = (): PlayerTestHarness => {
  const clock = new ManualClock();
  const player = new FakePlayer({ clock });
  return {
    player,
    source: SOURCE,
    advance: (deltaMs) => {
      clock.advance(deltaMs);
      player.tick();
    },
  };
};

// The FakePlayer must satisfy the shared IPlayer contract (LSP).
runPlayerContract('FakePlayer', makeHarness);

describe('FakePlayer specifics', () => {
  it('surfaces a bad source as the error state + event (not a rejection)', async () => {
    const player = new FakePlayer({ clock: new ManualClock() });
    const events: PlayerEvent[] = [];
    player.subscribe((e) => events.push(e));

    await expect(player.open({ id: 'x', uri: 'fake://x' })).resolves.toBeUndefined();
    expect(player.state).toBe('error');
    expect(events.map((e) => e.type)).toContain('error');
  });

  it('can retry open after a failure', async () => {
    const player = new FakePlayer({ clock: new ManualClock() });
    await player.open({ id: 'x', uri: 'fake://x' }); // fails → error
    await player.open(SOURCE); // retry succeeds
    expect(player.state).toBe('ready');
    expect(player.duration()).toBe(10_000);
  });

  it('tick is a no-op unless playing', () => {
    const player = new FakePlayer({ clock: new ManualClock() });
    const listener = vi.fn();
    player.subscribe(listener);
    player.tick(); // idle
    expect(listener).not.toHaveBeenCalled();
  });

  it('derives a live position from the clock even between ticks', async () => {
    const clock = new ManualClock();
    const player = new FakePlayer({ clock });
    await player.open(SOURCE);
    await player.play();
    clock.advance(1500); // no tick
    expect(player.position()).toBe(1500);
  });

  it('changing speed mid-playback preserves already-elapsed time', async () => {
    const clock = new ManualClock();
    const player = new FakePlayer({ clock });
    await player.open(SOURCE);
    await player.play();
    clock.advance(1000); // +1000 at 1x
    player.setSpeed(3);
    clock.advance(1000); // +3000 at 3x
    expect(player.position()).toBe(4000);
  });

  it('ManualClock refuses to move backwards', () => {
    const clock = new ManualClock(100);
    expect(() => clock.advance(-1)).toThrow();
    expect(() => clock.set(50)).toThrow();
    expect(clock.set(200).now()).toBe(200);
  });
});
