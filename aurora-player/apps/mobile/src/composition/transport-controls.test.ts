import { describe, expect, it, vi } from 'vitest';
import {
  FakePlayer,
  ManualClock,
  type MediaSource,
} from '@aurora/player-api';
import { createTransportControls, formatClock } from './transport-controls.js';

const MEDIA: MediaSource = {
  id: 'clip',
  uri: 'file:///clip.mp4',
  title: 'Clip',
  durationMs: 60_000,
};

// A FakePlayer opened to `ready`, plus its manual clock so tests can advance
// the playhead deterministically (no Date.now — plan rule ①.E).
const openReady = async () => {
  const clock = new ManualClock();
  const player = new FakePlayer({ clock });
  await player.open(MEDIA);
  return { clock, player };
};

describe('createTransportControls · snapshot', () => {
  it('reports idle/disabled before any media opens', () => {
    const clock = new ManualClock();
    const player = new FakePlayer({ clock });
    const transport = createTransportControls(player);
    const s = transport.state();
    expect(s.state).toBe('idle');
    expect(s.canPlay).toBe(false);
    expect(s.playing).toBe(false);
    expect(s.progress).toBe(0);
    transport.dispose();
  });

  it('is playable and reports progress once opened and playing', async () => {
    const { clock, player } = await openReady();
    const transport = createTransportControls(player);
    expect(transport.state().canPlay).toBe(true);

    transport.play();
    clock.advance(15_000);
    player.tick();

    const s = transport.state();
    expect(s.playing).toBe(true);
    expect(s.positionMs).toBe(15_000);
    expect(s.durationMs).toBe(60_000);
    expect(s.progress).toBeCloseTo(0.25, 5);
    transport.dispose();
  });
});

describe('createTransportControls · actions', () => {
  it('togglePlay flips between playing and paused', async () => {
    const { player } = await openReady();
    const transport = createTransportControls(player);

    transport.togglePlay();
    expect(player.state).toBe('playing');
    transport.togglePlay();
    expect(player.state).toBe('paused');
    transport.dispose();
  });

  it('play() and pause() drive the port directly', async () => {
    const { player } = await openReady();
    const transport = createTransportControls(player);

    transport.pause(); // no-op while not playing
    expect(player.state).toBe('ready');
    transport.play();
    expect(player.state).toBe('playing');
    transport.pause();
    expect(player.state).toBe('paused');
    transport.dispose();
  });

  it('play() from ended restarts from the head', async () => {
    const { clock, player } = await openReady();
    const transport = createTransportControls(player);

    transport.play();
    clock.advance(60_000);
    player.tick(); // rolls over to `ended`
    expect(player.state).toBe('ended');

    transport.play();
    await Promise.resolve(); // let the seek(0).then(play) microtasks settle
    await Promise.resolve();
    expect(player.state).toBe('playing');
    expect(player.position()).toBe(0);
    transport.dispose();
  });

  it('seekTo clamps into [0, duration]', async () => {
    const { player } = await openReady();
    const transport = createTransportControls(player);

    transport.seekTo(999_999);
    expect(player.position()).toBe(60_000);
    transport.seekTo(-500);
    expect(player.position()).toBe(0);
    transport.dispose();
  });

  it('seekBy moves relative to the live position', async () => {
    const { player } = await openReady();
    const transport = createTransportControls(player);

    transport.seekTo(20_000);
    transport.seekBy(5_000);
    expect(player.position()).toBe(25_000);
    transport.seekBy(-30_000);
    expect(player.position()).toBe(0);
    transport.dispose();
  });

  it('seek is a no-op before media loads', () => {
    const clock = new ManualClock();
    const player = new FakePlayer({ clock });
    const transport = createTransportControls(player);
    expect(() => transport.seekTo(1_000)).not.toThrow();
    expect(player.position()).toBe(0);
    transport.dispose();
  });

  it('setSpeed rejects non-positive rates', async () => {
    const { player } = await openReady();
    const transport = createTransportControls(player);
    const spy = vi.spyOn(player, 'setSpeed');

    transport.setSpeed(1.5);
    expect(spy).toHaveBeenCalledWith(1.5);
    transport.setSpeed(0);
    transport.setSpeed(-2);
    expect(spy).toHaveBeenCalledTimes(1);
    transport.dispose();
  });
});

describe('createTransportControls · subscription', () => {
  it('notifies listeners on player events and stops after unsubscribe', async () => {
    const { clock, player } = await openReady();
    const transport = createTransportControls(player);
    const seen: number[] = [];
    const off = transport.subscribe((s) => seen.push(s.positionMs));

    transport.play();
    clock.advance(1_000);
    player.tick();
    expect(seen.length).toBeGreaterThan(0);

    const countAfterFirst = seen.length;
    off();
    clock.advance(1_000);
    player.tick();
    expect(seen.length).toBe(countAfterFirst);
    transport.dispose();
  });

  it('dispose unsubscribes from the player', async () => {
    const { clock, player } = await openReady();
    const transport = createTransportControls(player);
    const seen: number[] = [];
    transport.subscribe((s) => seen.push(s.positionMs));

    transport.dispose();
    transport.play();
    clock.advance(1_000);
    player.tick();
    expect(seen).toEqual([]);
  });
});

describe('formatClock', () => {
  it('formats sub-hour positions as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(5_000)).toBe('0:05');
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(600_000)).toBe('10:00');
  });

  it('formats hour+ positions as h:mm:ss', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00');
    expect(formatClock(3_661_000)).toBe('1:01:01');
  });

  it('clamps negative input to zero', () => {
    expect(formatClock(-1_000)).toBe('0:00');
  });
});
