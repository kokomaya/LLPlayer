import type { ITelemetrySink, TelemetryEvent } from '@aurora/domain';

/**
 * A headless {@link ITelemetrySink} that records emitted events in memory.
 *
 * It is the offline, deterministic stand-in for a real analytics backend: the
 * default sink the CLI wraps in {@link ConsentGatedTelemetry}, and the recording
 * spy that lets tests assert exactly which points survived the opt-in gate. Pure
 * — no network, no clock, no I/O (rule ①.A.3 / ①.C.13).
 */
export class InMemoryTelemetrySink implements ITelemetrySink {
  readonly #events: TelemetryEvent[] = [];

  emit(event: TelemetryEvent): Promise<void> {
    this.#events.push(event);
    return Promise.resolve();
  }

  /** All events recorded so far, in emission order. */
  get events(): readonly TelemetryEvent[] {
    return this.#events;
  }
}
