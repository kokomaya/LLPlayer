import type { MediaSource, PlayerEvent } from '@aurora/player-api';
import {
  runPlayerContract,
  type PlayerTestHarness,
} from '@aurora/player-api/contract';
import { describe, expect, it } from 'vitest';
import { FakeNativeVideoSurface } from './fake-native-video-surface.js';
import { ReactNativeVideoPlayer } from './react-native-video-player.js';

const SOURCE: MediaSource = {
  id: 'm1',
  uri: 'rnv://m1',
  durationMs: 10_000,
  tracks: [
    { id: 'v1', kind: 'video' },
    { id: 'a1', kind: 'audio', language: 'en' },
  ],
};

const makeHarness = (): PlayerTestHarness => {
  const surface = new FakeNativeVideoSurface({ durationSec: 10 });
  const player = new ReactNativeVideoPlayer(surface);
  return {
    player,
    source: SOURCE,
    advance: (deltaMs) => surface.advance(deltaMs),
  };
};

// The Android adapter core must satisfy the SAME IPlayer contract as the
// FakePlayer (LSP) — this is the plan's "contract test runs against any
// implementation" acceptance criterion, proven for a real-ish adapter.
runPlayerContract('ReactNativeVideoPlayer', makeHarness);

describe('ReactNativeVideoPlayer specifics', () => {
  it('issues native commands in response to transport calls', async () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10 });
    const player = new ReactNativeVideoPlayer(surface);
    await player.open(SOURCE);
    player.setSpeed(1.5);
    await player.play();
    await player.seek(4000);
    await player.pause();
    player.dispose();
    expect(surface.issued).toEqual([
      'load:rnv://m1',
      'setRate:1.5',
      'play',
      'seek:4',
      'pause',
      'release',
    ]);
  });

  it('maps a native load error to the error state + event (not a rejection)', async () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10, failOnLoad: true });
    const player = new ReactNativeVideoPlayer(surface);
    const events: PlayerEvent[] = [];
    player.subscribe((e) => events.push(e));

    await expect(player.open(SOURCE)).resolves.toBeUndefined();
    expect(player.state).toBe('error');
    expect(events.map((e) => e.type)).toContain('error');
  });

  it('can retry open after a failure', async () => {
    const failing = new FakeNativeVideoSurface({ durationSec: 10, failOnLoad: true });
    const player = new ReactNativeVideoPlayer(failing);
    await player.open(SOURCE); // fails → error
    expect(player.state).toBe('error');

    // A real app would swap in a fresh surface for the retry; the adapter only
    // needs a legal open() from the error state, which the machine permits.
    await player.open(SOURCE);
    expect(player.state).toBe('error'); // same failing surface → still error

    const ok = new ReactNativeVideoPlayer(new FakeNativeVideoSurface({ durationSec: 5 }));
    await ok.open(SOURCE);
    expect(ok.state).toBe('ready');
    expect(ok.duration()).toBe(5000); // native-reported duration wins
  });

  it('converts native seconds to domain milliseconds on progress', async () => {
    const surface = new FakeNativeVideoSurface({ durationSec: 10 });
    const player = new ReactNativeVideoPlayer(surface);
    await player.open(SOURCE);
    await player.play();
    surface.advance(2500); // 2.5s of native playback
    expect(player.position()).toBe(2500);
  });
});
