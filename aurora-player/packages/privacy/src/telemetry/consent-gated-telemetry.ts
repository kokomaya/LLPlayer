import type {
  ConsentRepository,
  DataUse,
  ITelemetrySink,
  TelemetryEvent,
} from '@aurora/domain';
import { isPermitted } from '../policy.js';

/**
 * The data uses a telemetry point requires: just `telemetry`. Declared once here
 * so the opt-in gate is spelled in a single place (mirrors `ONLINE_DATA_USES`).
 */
export const TELEMETRY_DATA_USES: readonly DataUse[] = ['telemetry'];

/**
 * Consent gate for telemetry, as a DECORATOR over any {@link ITelemetrySink}
 * (plan/12 · legal-privacy: telemetry must be opt-in).
 *
 * It wraps an inner sink and, on every `emit`, loads the current consent and
 * drops the event unless `telemetry` is granted — REUSING `@aurora/privacy`'s
 * {@link isPermitted} rather than re-implementing the check (rule ①.F.21: the
 * consent gate is reused, never re-created). Because it is a decorator, no
 * existing use-case or sink changes to become opt-in (OCP): you wrap the real
 * backend at the composition root and it silently becomes compliant.
 *
 * Boundary note: this lives in `@aurora/privacy` (not a separate telemetry
 * package) precisely because it needs `isPermitted`. A `layer:domain` package
 * may depend only on the kernel, never on another domain package (rule ①.A.2),
 * so a standalone telemetry package could not import `@aurora/privacy`. Hosting
 * the gate where `isPermitted` already lives keeps the reuse boundary-legal; the
 * event model + sink PORT live in the kernel so every backend shares them.
 */
export class ConsentGatedTelemetry implements ITelemetrySink {
  readonly #inner: ITelemetrySink;
  readonly #consent: ConsentRepository;

  constructor(inner: ITelemetrySink, consent: ConsentRepository) {
    this.#inner = inner;
    this.#consent = consent;
  }

  /** Forward to the inner sink only when `telemetry` consent is granted; else drop. */
  async emit(event: TelemetryEvent): Promise<void> {
    const state = await this.#consent.load();
    if (!isPermitted(TELEMETRY_DATA_USES, state)) {
      return; // opt-in not given → event dropped, never buffered
    }
    await this.#inner.emit(event);
  }
}
