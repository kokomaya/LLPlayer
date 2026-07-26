/**
 * REFERENCE ONLY — excluded from the CI build/test/lint graph (`*.example.ts`).
 *
 * A real telemetry backend sketch (PostHog / Sentry / a self-hosted HTTP
 * collector) implementing the SAME kernel {@link ITelemetrySink} port the
 * headless {@link InMemoryTelemetrySink} does — proving a network backend is a
 * drop-in substitute (LSP). It needs network access + a DSN/token, so it is NOT
 * part of the pure, hermetic core CI unit-tests; it is validated off-CI.
 *
 * THE OPT-IN GUARANTEE IS NOT THIS FILE'S JOB (rule ①.F.21): at the composition
 * root you wrap this in `ConsentGatedTelemetry`, so events are dropped until the
 * user grants `telemetry` consent — this sink only ever sees permitted events:
 *
 *     const sink = new ConsentGatedTelemetry(
 *       new HttpTelemetrySink({ dsn: process.env.AURORA_TELEMETRY_DSN! }),
 *       new SqliteConsentRepository(db),
 *     );
 *
 * SECURITY (rule ①.E): never hard-code or commit a DSN/token. Read it from an
 * environment variable / untracked file at the composition root and inject it
 * here. DATA MINIMISATION (plan/12): only forward the event as built — the
 * `telemetryEvent` factory already rejects non-PII scalars, so no identity data
 * reaches the wire.
 *
 * To activate off-CI: drop the `.example` segment and inject it as the inner
 * sink of `ConsentGatedTelemetry`.
 */
import type { ITelemetrySink, TelemetryEvent } from '@aurora/domain';

export interface HttpTelemetryConfig {
  /** Collector ingest URL, e.g. `https://t.example.com/ingest`. */
  readonly dsn: string;
  /** Injected from `process.env.AURORA_TELEMETRY_TOKEN` at the composition root. */
  readonly token?: string;
}

export class HttpTelemetrySink implements ITelemetrySink {
  constructor(private readonly config: HttpTelemetryConfig) {}

  async emit(event: TelemetryEvent): Promise<void> {
    const res = await fetch(this.config.dsn, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.token !== undefined
          ? { authorization: `Bearer ${this.config.token}` }
          : {}),
      },
      // The event is already validated to be non-PII scalars (data minimisation).
      body: JSON.stringify(event),
    });
    if (!res.ok) {
      // Telemetry is best-effort: a failed send must never break the app. A real
      // sink would swallow/queue this; kept explicit here for the reference.
      throw new Error(`telemetry ingest ${res.status}`);
    }
  }
}
