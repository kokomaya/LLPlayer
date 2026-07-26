import { describe, expect, it } from 'vitest';
import type { MediaSource, PlayerEvent, PlayerEventType } from '../model.js';
import type { IPlayer } from '../port.js';

/**
 * The harness an implementation supplies so the shared contract can drive it
 * deterministically. `advance` moves the implementation's logical clock forward
 * and lets it emit any due `positionChanged`/`ended` events — the seam a real
 * adapter fills with its frame/timer loop, and the FakePlayer fills with
 * `clock.advance(d) + tick()`.
 */
export interface PlayerTestHarness {
  readonly player: IPlayer;
  /** A source with a known, finite duration the player can fully open. */
  readonly source: MediaSource;
  advance(deltaMs: number): void;
}

/**
 * Reusable behaviour spec for {@link IPlayer} implementations (plan/09 §1). Any
 * adapter that passes this identical suite is a drop-in substitute for the port
 * (LSP) — this is how the plan's "contract test can run against any
 * implementation" acceptance criterion becomes verifiable in CI.
 */
export const runPlayerContract = (
  name: string,
  makeHarness: () => PlayerTestHarness,
): void => {
  describe(`IPlayer contract: ${name}`, () => {
    /** Subscribe and collect every event a body produces. */
    const record = (
      player: IPlayer,
    ): { readonly events: PlayerEvent[]; types(): PlayerEventType[] } => {
      const events: PlayerEvent[] = [];
      player.subscribe((e) => events.push(e));
      return { events, types: () => events.map((e) => e.type) };
    };

    const opened = async (): Promise<PlayerTestHarness> => {
      const h = makeHarness();
      await h.player.open(h.source);
      return h;
    };

    it('starts idle with zero position and duration', () => {
      const { player } = makeHarness();
      expect(player.state).toBe('idle');
      expect(player.position()).toBe(0);
      expect(player.duration()).toBe(0);
    });

    it('open transitions idle→opening→ready and emits opened', async () => {
      const h = makeHarness();
      const rec = record(h.player);
      await h.player.open(h.source);

      expect(h.player.state).toBe('ready');
      expect(h.player.duration()).toBe(h.source.durationMs);
      expect(h.player.position()).toBe(0);
      expect(rec.types()).toEqual([
        'stateChanged',
        'stateChanged',
        'opened',
      ]);
      const opened = rec.events.find((e) => e.type === 'opened');
      expect(opened).toMatchObject({ durationMs: h.source.durationMs });
    });

    it('play from ready enters playing', async () => {
      const h = await opened();
      const rec = record(h.player);
      await h.player.play();
      expect(h.player.state).toBe('playing');
      expect(rec.events).toContainEqual({
        type: 'stateChanged',
        from: 'ready',
        to: 'playing',
      });
    });

    it('advances position while playing and emits positionChanged', async () => {
      const h = await opened();
      await h.player.play();
      const rec = record(h.player);
      h.advance(2000);
      expect(h.player.position()).toBe(2000);
      expect(rec.events).toContainEqual({
        type: 'positionChanged',
        positionMs: 2000,
      });
    });

    it('pause freezes position; a paused player does not advance', async () => {
      const h = await opened();
      await h.player.play();
      h.advance(1000);
      await h.player.pause();
      expect(h.player.state).toBe('paused');
      const rec = record(h.player);
      h.advance(5000);
      expect(h.player.position()).toBe(1000);
      expect(rec.types()).not.toContain('positionChanged');
    });

    it('resumes from the paused position', async () => {
      const h = await opened();
      await h.player.play();
      h.advance(1000);
      await h.player.pause();
      await h.player.play();
      h.advance(1000);
      expect(h.player.position()).toBe(2000);
    });

    it('seek emits seeking then seeked and repositions', async () => {
      const h = await opened();
      const rec = record(h.player);
      await h.player.seek(3000);
      expect(h.player.position()).toBe(3000);
      const seekEvents = rec.types().filter((t) => t === 'seeking' || t === 'seeked');
      expect(seekEvents).toEqual(['seeking', 'seeked']);
    });

    it('seek while paused settles into ready; while playing stays playing', async () => {
      const h = await opened();
      await h.player.play();
      await h.player.pause();
      await h.player.seek(2000);
      expect(h.player.state).toBe('ready');

      await h.player.play();
      await h.player.seek(4000);
      expect(h.player.state).toBe('playing');
    });

    it('clamps seek targets to [0, duration]', async () => {
      const h = await opened();
      await h.player.seek(-500);
      expect(h.player.position()).toBe(0);
      await h.player.seek(h.source.durationMs! + 10_000);
      expect(h.player.position()).toBe(h.source.durationMs);
    });

    it('reaching the end emits ended and blocks play until re-seeked', async () => {
      const h = await opened();
      await h.player.play();
      const rec = record(h.player);
      h.advance(h.source.durationMs! + 1000);

      expect(h.player.state).toBe('ended');
      expect(rec.types()).toContain('ended');
      await expect(h.player.play()).rejects.toThrow();

      await h.player.seek(0);
      expect(h.player.state).toBe('ready');
      await expect(h.player.play()).resolves.toBeUndefined();
      expect(h.player.state).toBe('playing');
    });

    it('respects the playback rate', async () => {
      const h = await opened();
      h.player.setSpeed(2);
      await h.player.play();
      h.advance(1000);
      expect(h.player.position()).toBe(2000);
    });

    it('rejects an invalid playback rate', async () => {
      const h = await opened();
      expect(() => h.player.setSpeed(0)).toThrow();
      expect(() => h.player.setSpeed(-1)).toThrow();
    });

    it('rejects illegal transport usage (play before open)', async () => {
      const { player } = makeHarness();
      await expect(player.play()).rejects.toThrow();
      await expect(player.seek(0)).rejects.toThrow();
    });

    it('is idempotent for redundant play/pause (no duplicate events)', async () => {
      const h = await opened();
      await h.player.play();
      const rec = record(h.player);
      await h.player.play(); // already playing
      await h.player.pause();
      await h.player.pause(); // already paused
      const changes = rec.events.filter((e) => e.type === 'stateChanged');
      expect(changes).toEqual([
        { type: 'stateChanged', from: 'playing', to: 'paused' },
      ]);
    });

    it('stops delivering to an unsubscribed listener', async () => {
      const h = await opened();
      const seen: PlayerEvent[] = [];
      const off = h.player.subscribe((e) => seen.push(e));
      await h.player.play();
      off();
      h.advance(1000);
      expect(seen.some((e) => e.type === 'positionChanged')).toBe(false);
    });

    it('dispose returns to idle and detaches listeners', async () => {
      const h = await opened();
      const rec = record(h.player);
      h.player.dispose();
      expect(h.player.state).toBe('idle');
      const before = rec.events.length;
      // No further events reach a detached listener.
      expect(rec.events.length).toBe(before);
    });
  });
};
