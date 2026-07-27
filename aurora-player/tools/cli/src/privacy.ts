import { DATA_USES, isDataUse, type DataUse } from '@aurora/domain';
import {
  DEFAULT_PROCESSING_MANIFEST,
  missingDisclosures,
  type ProcessingManifest,
  type ProcessingRecord,
} from '@aurora/privacy';
import type { CliIO } from './run.js';

/**
 * `aurora privacy disclose [--use <cat>]` — the CLI echo of the data-processing
 * transparency manifest (plan/12 · Art.13/14/30). It prints, for each
 * capability, what data uses it performs and why — the honest "what we do with
 * your data" the consent screen mirrors. Optional `--use <cat>` filters to the
 * capabilities that perform one data use.
 *
 * I/O-only over pure static metadata (no repository, db, network or credential),
 * so it lives beside the other io-only commands and dispatches from `run()`.
 * Exit codes: 0 ok, 2 usage / bad data use.
 */

export const PRIVACY_USAGE = `Privacy (data-processing transparency):
  aurora privacy disclose [--use <cat>]      Show how each capability uses data

  Data uses: ${DATA_USES.join(', ')}
`;

/** True when `argv[0]` addresses the privacy transparency commands. */
export const isPrivacyCommand = (command: string | undefined): boolean =>
  command === 'privacy';

const formatRecord = (record: ProcessingRecord): string => {
  const retention =
    record.retentionDays !== undefined
      ? `retention ${record.retentionDays}d`
      : 'not retained';
  return `${record.capability}  [${record.uses.join(', ')}]  (${retention})\n    ${record.purpose}`;
};

const runDisclose = (
  args: readonly string[],
  io: CliIO,
  manifest: ProcessingManifest,
): number => {
  let use: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--use') {
      use = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--use=')) {
      use = arg.slice('--use='.length);
    }
  }

  let records = manifest;
  if (use !== undefined) {
    if (!isDataUse(use)) {
      io.writeError(`error: unknown data use "${use}" (one of ${DATA_USES.join('|')})\n`);
      return 2;
    }
    const wanted: DataUse = use;
    records = manifest.filter((r) => r.uses.includes(wanted));
  }

  if (records.length === 0) {
    io.write('(no disclosed processing for that data use)\n');
    return 0;
  }
  for (const record of records) {
    io.write(`${formatRecord(record)}\n`);
  }
  // Surface the taxonomy categories nothing discloses, so the report is honest
  // about what is NOT processed (only when listing the whole manifest).
  if (use === undefined) {
    const silent = missingDisclosures(manifest);
    if (silent.length > 0) {
      io.write(`not processed: ${silent.join(', ')}\n`);
    }
  }
  return 0;
};

/** Dispatch a privacy subcommand. Assumes {@link isPrivacyCommand}(argv[0]). */
export const runPrivacy = (argv: readonly string[], io: CliIO): number => {
  if (argv[1] === 'disclose') {
    return runDisclose(argv.slice(2), io, DEFAULT_PROCESSING_MANIFEST);
  }
  io.writeError(`error: unknown privacy subcommand\n${PRIVACY_USAGE}`);
  return 2;
};
