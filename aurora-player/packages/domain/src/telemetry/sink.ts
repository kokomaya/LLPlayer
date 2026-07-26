import type { TelemetryEvent } from './event.js';

/**
 * Emission port for telemetry (plan/12 · legal-privacy; DIP).
 *
 * Like the consent + cache ports, this abstraction lives in the KERNEL so both
 * the consumers (composition roots that emit points) and the implementations
 * (the consent-gating decorator + in-memory sink in `@aurora/privacy`, a real
 * HTTP/analytics backend injected off-CI) depend on one shared abstraction
 * without depending on each other — a domain package may depend only on the
 * kernel (plan/03 §3).
 *
 * The opt-in guarantee (plan/12: telemetry must be opt-in) is NOT this port's
 * job — it is enforced by a decorator (`ConsentGatedTelemetry` in
 * `@aurora/privacy`) that wraps any sink and drops events until the user has
 * granted `telemetry` consent. That keeps this port minimal (ISP) and the gate
 * reusable across every backend.
 */
export interface ITelemetrySink {
  /** Deliver one event. Implementations must not throw for a benign drop. */
  emit(event: TelemetryEvent): Promise<void>;
}
