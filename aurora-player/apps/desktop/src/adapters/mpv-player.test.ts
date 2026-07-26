import type { MediaSource, PlayerEvent } from '@aurora/player-api';
import {
  runPlayerContract,
  type PlayerTestHarness,
} from '@aurora/player-api/contract';
import { describe, expect, it } from 'vitest';
import { FakeDesktopVideoSurface } from './fake-desktop-video-surface.js';
import { MpvPlayer } from './mpv-player.js';

const SOURCE: MediaSource = {
  id: 'm1',
  uri: 'mpv://m1',
  durationMs: 10_000,
  tracks: [
    { id: 'v1', kind: 'video' },
    { id: 'a1', kind: 'audio', language: 'en' },
  ],
};

const makeHarness = (): PlayerTestHarness => {
  const surface = new FakeDesktopVideoSurface({ durationSec: 10 });
  const player = new MpvPlayer(surface);
  return {
    player,
    source: SOURCE,
    advance: (deltaMs) => surface.advance(deltaMs),
  };
};

// The desktop adapter core must satisfy the SAME IPlayer contract as FakePlayer
// AND the mobile ReactNativeVideoPlayer (LSP) — three implementations, one
// behaviour spec. This is the M3 acceptance proof for a heterogeneous backend.
runPlayerContract('MpvPlayer', makeHarness);

describe('MpvPlayer specifics', () => {
  it('issues libmpv commands in response to transport calls', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 10 });
    const player = new MpvPlayer(surface);
    await player.open(SOURCE);
    player.setSpeed(1.5);
    await player.play();
    await player.seek(4000);
    await player.pause();
    player.dispose();
    // Note the mpv shape: a single `pause:false/true` property drives play/pause
    // (no distinct play/pause verbs), unlike the RN surface.
    expect(surface.issued).toEqual([
      'loadfile:mpv://m1',
      'speed:1.5',
      'pause:false',
      'seek:4',
      'pause:true',
      'destroy',
    ]);
  });

  it('demultiplexes end-file(error) into the error state + event (not a rejection)', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 10, failOnLoad: true });
    const player = new MpvPlayer(surface);
    const events: PlayerEvent[] = [];
    player.subscribe((e) => events.push(e));

    await expect(player.open(SOURCE)).resolves.toBeUndefined();
    expect(player.state).toBe('error');
    expect(events.map((e) => e.type)).toContain('error');
  });

  it('demultiplexes end-file(eof) into ended while playing', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 5 });
    const player = new MpvPlayer(surface);
    const events: PlayerEvent[] = [];
    await player.open(SOURCE);
    await player.play();
    player.subscribe((e) => events.push(e));
    surface.advance(6000); // past the 5s end
    expect(player.state).toBe('ended');
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['positionChanged', 'stateChanged', 'ended']),
    );
  });

  it('ignores end-file(stop) — a deliberate stop is not a lifecycle change', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 10 });
    const player = new MpvPlayer(surface);
    await player.open(SOURCE);
    await player.play();
    const events: PlayerEvent[] = [];
    player.subscribe((e) => events.push(e));
    surface.emitEndFile('stop'); // e.g. file replaced — no lifecycle transition
    expect(player.state).toBe('playing'); // unchanged
    expect(events).toHaveLength(0); // neither ended nor error emitted
  });

  it('routes a mid-playback end-file(error) to the error state', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 10 });
    const player = new MpvPlayer(surface);
    await player.open(SOURCE);
    await player.play();
    const events: PlayerEvent[] = [];
    player.subscribe((e) => events.push(e));
    surface.emitEndFile('error', 'decoder crashed');
    expect(player.state).toBe('error');
    expect(events).toContainEqual({ type: 'error', message: 'decoder crashed' });
  });

  it('recovers with a fresh handle after a load failure', async () => {
    const failing = new MpvPlayer(new FakeDesktopVideoSurface({ durationSec: 10, failOnLoad: true }));
    await failing.open(SOURCE);
    expect(failing.state).toBe('error');

    const ok = new MpvPlayer(new FakeDesktopVideoSurface({ durationSec: 7 }));
    await ok.open(SOURCE);
    expect(ok.state).toBe('ready');
    expect(ok.duration()).toBe(7000); // native-reported duration wins
  });

  it('converts native seconds to domain milliseconds on progress', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 10 });
    const player = new MpvPlayer(surface);
    await player.open(SOURCE);
    await player.play();
    surface.advance(2500); // 2.5s of native playback
    expect(player.position()).toBe(2500);
  });

  it('falls back to the source duration when mpv reports 0', async () => {
    const surface = new FakeDesktopVideoSurface({ durationSec: 0 });
    const player = new MpvPlayer(surface);
    await player.open(SOURCE);
    expect(player.state).toBe('ready');
    expect(player.duration()).toBe(SOURCE.durationMs); // 10_000 from the source
  });
});
