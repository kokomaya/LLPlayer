import { describe, expect, it, vi } from 'vitest';
import { createEvent } from './catalog.js';
import { EventBus } from './event-bus.js';

describe('EventBus', () => {
  it('delivers events to subscribers of the matching type', () => {
    const bus = new EventBus();
    const received: number[] = [];
    bus.subscribe('PositionChanged', (e) => received.push(e.payload.positionMs));

    bus.publish(createEvent('PositionChanged', { positionMs: 42 }, 0));
    bus.publish(createEvent('PositionChanged', { positionMs: 99 }, 0));

    expect(received).toEqual([42, 99]);
  });

  it('does not deliver to subscribers of other types', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('WordSelected', handler);
    bus.publish(createEvent('PositionChanged', { positionMs: 1 }, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribe stops delivery and cleans up empty sets', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const off = bus.subscribe('PositionChanged', handler);
    expect(bus.listenerCount('PositionChanged')).toBe(1);
    off();
    expect(bus.listenerCount('PositionChanged')).toBe(0);
    bus.publish(createEvent('PositionChanged', { positionMs: 1 }, 0));
    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates errors: one throwing subscriber does not block the others', () => {
    const errors: unknown[] = [];
    const bus = new EventBus({ onError: (r) => errors.push(r.error) });
    const good = vi.fn();
    bus.subscribe('PositionChanged', () => {
      throw new Error('bad subscriber');
    });
    bus.subscribe('PositionChanged', good);

    bus.publish(createEvent('PositionChanged', { positionMs: 7 }, 0));

    expect(good).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
  });

  it('snapshots subscribers so mutation during dispatch is safe', () => {
    const bus = new EventBus();
    const late = vi.fn();
    bus.subscribe('PositionChanged', () => {
      // Subscribing during dispatch must not affect the current round.
      bus.subscribe('PositionChanged', late);
    });
    bus.publish(createEvent('PositionChanged', { positionMs: 1 }, 0));
    expect(late).not.toHaveBeenCalled();
  });

  it('clear removes all subscribers', () => {
    const bus = new EventBus();
    bus.subscribe('PositionChanged', vi.fn());
    bus.clear();
    expect(bus.listenerCount('PositionChanged')).toBe(0);
  });
});
