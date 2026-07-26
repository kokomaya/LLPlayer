/**
 * Telemetry event model for the opt-in analytics pipeline (plan/12 · legal-privacy).
 *
 * Hosted in the KERNEL on purpose: the telemetry event + sink port are a
 * cross-cutting concern shared by the policy package (`@aurora/privacy`, which
 * gates emission on consent) and every composition root (that wires a real
 * backend). A domain package may depend only on the kernel (plan/03 §3), so
 * hosting the value type + port here lets every side depend on one shared
 * abstraction (DIP) — exactly as the consent model and the AI `CacheRepository`
 * do.
 *
 * DATA MINIMISATION / NO PII (rule ①.E, plan/12): event props are restricted to
 * NON-PII scalars — no nested objects, arrays, or free-form identity fields. The
 * {@link telemetryEvent} factory enforces the scalar shape mechanically so a
 * caller cannot smuggle a `{ user }` object or an array of history into a point.
 *
 * Timestamps are epoch-ms `number`s supplied by the caller's injected clock
 * (never `Date.now()`), the same unit consent + the cache use, so a telemetry
 * stream is deterministic under a `ManualClock` (rule ①.C.13).
 */

/** A single non-PII scalar telemetry property value. No objects/arrays. */
export type TelemetryScalar = string | number | boolean;

/**
 * One telemetry point. `name` is a stable dot-scoped event key (e.g.
 * `consent.granted`); `at` is the injected epoch-ms timestamp; `props` are
 * optional non-PII scalar dimensions (e.g. `{ count: 2 }`), never identity data.
 */
export interface TelemetryEvent {
  readonly name: string;
  readonly at: number;
  readonly props?: Readonly<Record<string, TelemetryScalar>>;
}

/** True for the three allowed scalar prop types (rejects object/array/null/undefined). */
const isScalar = (value: unknown): value is TelemetryScalar => {
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean';
};

/**
 * Build a validated {@link TelemetryEvent}. Rejects an empty `name` and any
 * non-scalar prop value, so a PII-shaped payload (nested object, array, `null`)
 * cannot enter the pipeline. Pure: no clock, no I/O — `at` is injected.
 */
export const telemetryEvent = (
  name: string,
  at: number,
  props?: Readonly<Record<string, TelemetryScalar>>,
): TelemetryEvent => {
  if (name.trim() === '') {
    throw new Error('telemetry event name must be non-empty');
  }
  if (props === undefined) {
    return { name, at };
  }
  for (const [key, value] of Object.entries(props)) {
    if (!isScalar(value)) {
      throw new Error(
        `telemetry prop "${key}" must be a non-PII scalar (string|number|boolean), got ${typeof value}`,
      );
    }
  }
  return { name, at, props };
};
