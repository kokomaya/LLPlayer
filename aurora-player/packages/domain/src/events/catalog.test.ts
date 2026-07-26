import { describe, expect, it } from 'vitest';
import { createEvent } from './catalog.js';

describe('createEvent', () => {
  it('builds a fully-typed event with the given payload', () => {
    const event = createEvent('MediaOpened', {
      mediaId: 'm1',
      durationMs: 1000,
      tracks: [{ id: 't1', kind: 'subtitle', language: 'en' }],
    });
    expect(event.type).toBe('MediaOpened');
    expect(event.payload.mediaId).toBe('m1');
    expect(event.payload.tracks[0]?.kind).toBe('subtitle');
    expect(typeof event.occurredAt).toBe('number');
  });

  it('respects an explicit occurredAt (deterministic tests)', () => {
    const event = createEvent('PositionChanged', { positionMs: 5 }, 123);
    expect(event.occurredAt).toBe(123);
  });

  it('defaults occurredAt to a wall-clock timestamp', () => {
    const before = Date.now();
    const event = createEvent('PositionChanged', { positionMs: 5 });
    expect(event.occurredAt).toBeGreaterThanOrEqual(before);
  });
});
