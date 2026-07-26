import {
  emptyConsent,
  telemetryEvent,
  withConsent,
  type ConsentRepository,
  type ConsentState,
} from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { runTelemetryGateContract } from '../contract/telemetry-gate-contract.js';
import { ConsentGatedTelemetry } from './consent-gated-telemetry.js';
import { InMemoryTelemetrySink } from './in-memory-telemetry-sink.js';

/**
 * A kernel-only fake consent repository. `@aurora/privacy` may not import
 * `@aurora/storage` (both are `layer:domain`; rule ①.A.2), so the gate's tests
 * drive consent through this in-test fake built from kernel primitives. The real
 * SQLite/in-memory repos are proven separately against the storage contract.
 */
const makeFakeConsent = (): ConsentRepository => {
  let state: ConsentState = emptyConsent();
  return {
    load: () => Promise.resolve(state),
    grant: (use, at) => {
      state = withConsent(state, use, true, at);
      return Promise.resolve();
    },
    revoke: (use, at) => {
      state = withConsent(state, use, false, at);
      return Promise.resolve();
    },
    clear: () => {
      state = emptyConsent();
      return Promise.resolve();
    },
  };
};

// The real decorator must satisfy the reusable opt-in gate contract (LSP).
runTelemetryGateContract({
  name: 'ConsentGatedTelemetry',
  makeConsent: makeFakeConsent,
  makeGate: (inner, consent) => new ConsentGatedTelemetry(inner, consent),
});

const AT = 1_700_000_000_000;

describe('InMemoryTelemetrySink', () => {
  it('records emitted events in order, props intact', async () => {
    const sink = new InMemoryTelemetrySink();
    await sink.emit(telemetryEvent('a', AT));
    await sink.emit(telemetryEvent('b', AT + 1, { n: 2 }));
    expect(sink.events).toEqual([
      { name: 'a', at: AT },
      { name: 'b', at: AT + 1, props: { n: 2 } },
    ]);
  });
});

describe('ConsentGatedTelemetry over InMemoryTelemetrySink', () => {
  it('gates the real in-memory sink: off -> grant -> on -> revoke -> off', async () => {
    const inner = new InMemoryTelemetrySink();
    const consent = makeFakeConsent();
    const gate = new ConsentGatedTelemetry(inner, consent);

    await gate.emit(telemetryEvent('app.opened', AT));
    expect(inner.events).toHaveLength(0); // dropped before opt-in

    await consent.grant('telemetry', AT);
    await gate.emit(telemetryEvent('app.opened', AT + 1));
    expect(inner.events).toHaveLength(1);

    await consent.revoke('telemetry', AT + 2);
    await gate.emit(telemetryEvent('app.opened', AT + 3));
    expect(inner.events).toHaveLength(1); // still just the granted-window event
  });
});
