import { describe, expect, it } from 'vitest';
import { ManualClock } from './clock.js';
import { FakePlayer } from './fake-player.js';
import {
  supportsChapters,
  supportsPiP,
  supportsRecording,
  supportsSnapshot,
  type ISupportsSnapshot,
  type IPlayer,
} from './port.js';

describe('capability guards (ISP)', () => {
  it('report false for a minimal player advertising no capabilities', () => {
    const player = new FakePlayer({ clock: new ManualClock() });
    expect(supportsChapters(player)).toBe(false);
    expect(supportsSnapshot(player)).toBe(false);
    expect(supportsPiP(player)).toBe(false);
    expect(supportsRecording(player)).toBe(false);
  });

  it('narrow a player that implements an optional sub-interface', () => {
    const base = new FakePlayer({ clock: new ManualClock() });
    const withSnapshot: IPlayer & ISupportsSnapshot = Object.assign(base, {
      snapshot: async () => new Uint8Array([1, 2, 3]),
    });
    expect(supportsSnapshot(withSnapshot)).toBe(true);
    // The other capabilities remain absent.
    expect(supportsPiP(withSnapshot)).toBe(false);
  });
});
