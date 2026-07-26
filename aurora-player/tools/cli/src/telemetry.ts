import {
  isGranted,
  telemetryEvent,
  type ConsentRepository,
  type ITelemetrySink,
} from '@aurora/domain';
import type { CliIO } from './run.js';

/**
 * Everything the telemetry command needs, injected at the composition root (DIP).
 * `telemetry` is a {@link ConsentGatedTelemetry} wrapping a real/in-memory sink,
 * so emission is opt-in: a point is dropped unless `telemetry` consent is granted
 * (rule ①.F.21 — the consent gate is reused, not re-created). `now` is the sole
 * clock (rule ①.C.13). `consent` is read only to REPORT status; the actual gate
 * lives inside the injected sink.
 */
export interface TelemetryDeps {
  readonly consent: ConsentRepository;
  readonly telemetry: ITelemetrySink;
  readonly now: () => number;
}

export const TELEMETRY_USAGE = `Telemetry (opt-in analytics · privacy):
  aurora telemetry status                    Show whether telemetry is on (needs
                                             'telemetry' consent) and emit a point
                                             — dropped unless opted in
`;

/** True when `argv[0]` is the telemetry command. */
export const isTelemetryCommand = (command: string | undefined): boolean =>
  command === 'telemetry';

/**
 * `telemetry status`: report whether analytics would currently be reported (i.e.
 * `telemetry` consent is granted), then emit one point THROUGH the gated sink.
 * The point is silently dropped when opted out and recorded when opted in — the
 * end-to-end demonstration that telemetry is opt-in.
 */
const runStatus = async (io: CliIO, deps: TelemetryDeps): Promise<number> => {
  const state = await deps.consent.load();
  const on = isGranted(state, 'telemetry');
  io.write(`telemetry: ${on ? 'on' : 'off'}\n`);
  await deps.telemetry.emit(telemetryEvent('telemetry.status.viewed', deps.now()));
  return 0;
};

/** Dispatch a telemetry subcommand. Assumes {@link isTelemetryCommand}(argv[0]). */
export const runTelemetry = (
  argv: readonly string[],
  io: CliIO,
  deps: TelemetryDeps,
): Promise<number> => {
  if (argv[1] === 'status') {
    return runStatus(io, deps);
  }
  io.writeError(`error: unknown telemetry subcommand\n${TELEMETRY_USAGE}`);
  return Promise.resolve(2);
};
