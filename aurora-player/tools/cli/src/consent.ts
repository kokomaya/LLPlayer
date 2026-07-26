import {
  DATA_USES,
  isDataUse,
  isGranted,
  type ConsentRepository,
  type DataUse,
} from '@aurora/domain';
import { isPermitted, missingConsent, ONLINE_DATA_USES } from '@aurora/privacy';
import type { CliIO } from './run.js';

/**
 * Everything the consent commands need, injected at the composition root (DIP).
 * `now` is the sole clock (epoch ms) so consent decisions carry no wall clock
 * (rule ①.C.13). `fetchOnline` is the injected stand-in for a real online /
 * third-party capability (YouTube import, online LLM, …); in tests it is a pure
 * fake, off-CI it would read auth from the environment (rule ①.E). The point is
 * that it only runs once the consent gate permits it.
 */
export interface ConsentDeps {
  readonly consent: ConsentRepository;
  readonly now: () => number;
  readonly fetchOnline?: (ref: string) => Promise<string>;
}

export const CONSENT_USAGE = `Consent (privacy · data governance):
  aurora consent show                        Show each data use and whether it's granted
  aurora consent grant <use...>              Grant consent for one or more data uses
  aurora consent revoke <use...>             Revoke consent for one or more data uses
  aurora fetch <ref>                         A gated online capability (needs
                                             network + third-party consent)

  Data uses: ${DATA_USES.join(', ')}
`;

/** True when `argv[0]` is one of the consent / gated subcommands. */
export const isConsentCommand = (command: string | undefined): boolean =>
  command === 'consent' || command === 'fetch';

/** Parse raw args into validated data uses; null (after writing an error) on a bad value. */
const parseUses = (raw: readonly string[], io: CliIO): DataUse[] | null => {
  if (raw.length === 0) {
    io.writeError(`error: missing <use>\n${CONSENT_USAGE}`);
    return null;
  }
  const uses: DataUse[] = [];
  for (const value of raw) {
    if (!isDataUse(value)) {
      io.writeError(`error: unknown data use "${value}" (one of ${DATA_USES.join('|')})\n`);
      return null;
    }
    uses.push(value);
  }
  return uses;
};

const runShow = async (io: CliIO, deps: ConsentDeps): Promise<number> => {
  const state = await deps.consent.load();
  for (const use of DATA_USES) {
    io.write(`${use}: ${isGranted(state, use) ? 'granted' : 'not granted'}\n`);
  }
  return 0;
};

const runSet = async (
  args: readonly string[],
  io: CliIO,
  deps: ConsentDeps,
  granted: boolean,
): Promise<number> => {
  const uses = parseUses(args, io);
  if (uses === null) {
    return 2;
  }
  const at = deps.now();
  for (const use of uses) {
    if (granted) {
      await deps.consent.grant(use, at);
    } else {
      await deps.consent.revoke(use, at);
    }
  }
  io.write(`${granted ? 'granted' : 'revoked'}: ${uses.join(', ')}\n`);
  return 0;
};

/**
 * The gated online capability. Loads consent, and refuses (exit 1) unless every
 * required data use is granted — printing exactly which are missing plus the
 * command to grant them. Only when permitted does the injected `fetchOnline`
 * run. This is the runtime consent gate that complements the build-profile gate
 * (rule ①.F.20): the same YouTube-shaped capability must pass BOTH.
 */
const runFetch = async (
  args: readonly string[],
  io: CliIO,
  deps: ConsentDeps,
): Promise<number> => {
  const ref = args[0];
  if (ref === undefined) {
    io.writeError(`error: missing <ref>\n${CONSENT_USAGE}`);
    return 2;
  }
  const state = await deps.consent.load();
  const required = ONLINE_DATA_USES;
  if (!isPermitted(required, state)) {
    const missing = missingConsent(required, state);
    io.writeError(
      `error: consent required for: ${missing.join(', ')}\n` +
        `run: aurora consent grant ${missing.join(' ')}\n`,
    );
    return 1;
  }
  // Default stand-in keeps the demo deterministic and offline-testable; a real
  // binding is injected off-CI (reads auth from the environment, rule ①.E).
  const fetchOnline =
    deps.fetchOnline ?? ((r: string): Promise<string> => Promise.resolve(`fetched ${r}`));
  io.write(`${await fetchOnline(ref)}\n`);
  return 0;
};

/** Dispatch a consent subcommand. Assumes {@link isConsentCommand}(argv[0]). */
export const runConsent = (
  argv: readonly string[],
  io: CliIO,
  deps: ConsentDeps,
): Promise<number> => {
  if (argv[0] === 'fetch') {
    return runFetch(argv.slice(1), io, deps);
  }
  const sub = argv[1];
  if (sub === 'show') {
    return runShow(io, deps);
  }
  if (sub === 'grant') {
    return runSet(argv.slice(2), io, deps, true);
  }
  if (sub === 'revoke') {
    return runSet(argv.slice(2), io, deps, false);
  }
  io.writeError(`error: unknown consent subcommand\n${CONSENT_USAGE}`);
  return Promise.resolve(2);
};
