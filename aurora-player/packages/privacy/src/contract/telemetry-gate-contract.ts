import type {
  ConsentRepository,
  ITelemetrySink,
  TelemetryEvent,
} from '@aurora/domain';
import { telemetryEvent } from '@aurora/domain';
import { describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for a consent-gated telemetry sink (plan/09 §1 ·
 * contract tests; plan/12 · legal-privacy: telemetry must be opt-in). Any
 * decorator that gates emission on `telemetry` consent must pass this suite, so
 * the opt-in red line is a substitutable, verifiable transform (LSP).
 *
 * The case supplies two factories so the suite stays kernel-only (no dependency
 * on `@aurora/storage`): `makeConsent` builds a fresh consent repository the
 * suite drives (grant/revoke), and `makeGate` wraps a recording inner sink +
 * that repository into the gate under test.
 */
export interface TelemetryGateContractCase {
  readonly name: string;
  readonly makeConsent: () => ConsentRepository;
  readonly makeGate: (
    inner: ITelemetrySink,
    consent: ConsentRepository,
  ) => ITelemetrySink;
}

// A fixed injected timestamp — telemetry carries no wall clock (rule ①.C.13).
const AT = 1_700_000_000_000;

export const runTelemetryGateContract = (
  testCase: TelemetryGateContractCase,
): void => {
  const setup = (): {
    gate: ITelemetrySink;
    consent: ConsentRepository;
    recorded: readonly TelemetryEvent[];
  } => {
    const events: TelemetryEvent[] = [];
    const inner: ITelemetrySink = {
      emit: (event) => {
        events.push(event);
        return Promise.resolve();
      },
    };
    const consent = testCase.makeConsent();
    return { gate: testCase.makeGate(inner, consent), consent, recorded: events };
  };

  describe(`telemetry gate contract: ${testCase.name}`, () => {
    it('drops events until telemetry consent is granted', async () => {
      const { gate, recorded } = setup();
      await gate.emit(telemetryEvent('app.opened', AT));
      expect(recorded).toEqual([]);
    });

    it('emits once telemetry consent is granted, passing props through unchanged', async () => {
      const { gate, consent, recorded } = setup();
      await consent.grant('telemetry', AT);
      const event = telemetryEvent('app.opened', AT, { count: 3, first: true });
      await gate.emit(event);
      expect(recorded).toEqual([event]);
    });

    it('drops events again after telemetry consent is revoked', async () => {
      const { gate, consent, recorded } = setup();
      await consent.grant('telemetry', AT);
      await gate.emit(telemetryEvent('app.opened', AT));
      await consent.revoke('telemetry', AT + 1);
      await gate.emit(telemetryEvent('app.opened', AT + 2));
      expect(recorded).toEqual([telemetryEvent('app.opened', AT)]); // only the granted-window event
    });

    it('gates strictly on telemetry, not on unrelated consent', async () => {
      const { gate, consent, recorded } = setup();
      // Granting network/third-party does NOT enable telemetry (independent uses).
      await consent.grant('network', AT);
      await consent.grant('third-party', AT);
      await gate.emit(telemetryEvent('app.opened', AT));
      expect(recorded).toEqual([]);
    });
  });
};
