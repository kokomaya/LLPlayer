import type { DomainEventOf, EventType } from './catalog.js';

export type EventHandler<K extends EventType> = (
  event: DomainEventOf<K>,
) => void;

export type Unsubscribe = () => void;

export interface EventBusErrorReport {
  readonly type: EventType;
  readonly error: unknown;
}

export interface EventBusOptions {
  /**
   * Invoked when a subscriber throws. The bus always continues dispatching to
   * the remaining subscribers regardless (error isolation, plan/03 §5.1).
   */
  readonly onError?: (report: EventBusErrorReport) => void;
}

/**
 * A minimal, synchronous, typed publish/subscribe bus. Used for one-to-many
 * fan-out notifications; direct port calls remain the path for request/response
 * (see plan/03 §5.3 — "no event soup").
 */
export class EventBus {
  // A single untyped map keyed by event type; type-safety is enforced at the
  // public method boundaries via the generic signatures.
  readonly #handlers = new Map<EventType, Set<EventHandler<EventType>>>();
  readonly #onError: ((report: EventBusErrorReport) => void) | undefined;

  constructor(options: EventBusOptions = {}) {
    this.#onError = options.onError;
  }

  subscribe<K extends EventType>(
    type: K,
    handler: EventHandler<K>,
  ): Unsubscribe {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    const generic = handler as EventHandler<EventType>;
    set.add(generic);
    return () => {
      set.delete(generic);
      if (set.size === 0) {
        this.#handlers.delete(type);
      }
    };
  }

  publish<K extends EventType>(event: DomainEventOf<K>): void {
    const set = this.#handlers.get(event.type);
    if (!set || set.size === 0) {
      return;
    }
    // Snapshot so (un)subscribing during dispatch cannot disturb this round.
    for (const handler of [...set]) {
      try {
        handler(event);
      } catch (error) {
        this.#onError?.({ type: event.type, error });
      }
    }
  }

  /** Number of active subscribers for a type (primarily for tests/diagnostics). */
  listenerCount(type: EventType): number {
    return this.#handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.#handlers.clear();
  }
}
