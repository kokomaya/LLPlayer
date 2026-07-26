import { InMemoryConsentRepository } from '@aurora/storage';
import { ConsentGatedTelemetry, InMemoryTelemetrySink } from '@aurora/privacy';
import { describe, expect, it } from 'vitest';
import { runTelemetry, type TelemetryDeps } from './telemetry.js';
import type { CliIO } from './run.js';

/**
 * Composition-root test for the telemetry opt-in gate (plan/12): a telemetry
 * point is dropped until the user grants `telemetry` consent, emitted after, and
 * dropped again once revoked — proven through the CLI `telemetry status` surface
 * with the SAME `ConsentGatedTelemetry` the real composition root wires, fully
 * offline and deterministic (injected clock, in-memory repo + sink).
 */
interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

const makeInvoke = (deps: TelemetryDeps) => async (argv: string[]): Promise<Captured> => {
  let out = '';
  let err = '';
  const io: CliIO = {
    readFile: () => {
      throw new Error('unused');
    },
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  const code = await runTelemetry(argv, io, deps);
  return { out, err, code };
};

const AT = 1_700_000_000_000;

/** A gated sink over a recording in-memory sink, sharing one consent repo. */
const makeHarness = (): {
  deps: TelemetryDeps;
  consent: InMemoryConsentRepository;
  recorded: InMemoryTelemetrySink;
} => {
  const consent = new InMemoryConsentRepository();
  const recorded = new InMemoryTelemetrySink();
  const deps: TelemetryDeps = {
    consent,
    telemetry: new ConsentGatedTelemetry(recorded, consent),
    now: () => AT,
  };
  return { deps, consent, recorded };
};

describe('aurora telemetry slice', () => {
  it('runs the off -> grant -> on -> revoke -> off opt-in loop', async () => {
    const { deps, consent, recorded } = makeHarness();
    const invoke = makeInvoke(deps);

    // Opted out by default: reported off, and the point is dropped.
    const off = await invoke(['telemetry', 'status']);
    expect(off.code).toBe(0);
    expect(off.out).toBe('telemetry: off\n');
    expect(recorded.events).toHaveLength(0);

    // Grant telemetry consent → reported on, and the point is now recorded.
    await consent.grant('telemetry', AT);
    const on = await invoke(['telemetry', 'status']);
    expect(on.out).toBe('telemetry: on\n');
    expect(recorded.events).toHaveLength(1);
    expect(recorded.events[0]).toEqual({ name: 'telemetry.status.viewed', at: AT });

    // Revoke → reported off again, and no further points are recorded.
    await consent.revoke('telemetry', AT);
    const offAgain = await invoke(['telemetry', 'status']);
    expect(offAgain.out).toBe('telemetry: off\n');
    expect(recorded.events).toHaveLength(1);
  });

  it('does not report telemetry as on when only unrelated consent is granted', async () => {
    const { deps, consent, recorded } = makeHarness();
    await consent.grant('network', AT);
    await consent.grant('third-party', AT);
    const r = await makeInvoke(deps)(['telemetry', 'status']);
    expect(r.out).toBe('telemetry: off\n');
    expect(recorded.events).toHaveLength(0);
  });

  it('rejects an unknown telemetry subcommand with exit 2', async () => {
    const r = await makeInvoke(makeHarness().deps)(['telemetry', 'wat']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown telemetry subcommand');
  });
});
