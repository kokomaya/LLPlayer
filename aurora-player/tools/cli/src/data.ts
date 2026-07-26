import { DataSubjectService, RetentionService } from '@aurora/privacy';
import type { DataSubjectRepositories, RetentionPolicy } from '@aurora/privacy';
import type { DataExport } from '@aurora/domain';
import type { CliIO } from './run.js';

/** Days → milliseconds, so `--older-than` reads in human units. */
const DAY_MS = 86_400_000;

/**
 * Everything the data-subject commands need, injected at the composition root
 * (DIP). `repos` are the concrete kernel repository ports (SQLite in production,
 * in-memory in tests); `now` is the sole clock (rule ①.C.13) so an export
 * snapshot is deterministic; `writeFile` is optional so tests stay pure — only
 * `data export --out` needs it.
 */
export interface DataDeps {
  readonly repos: DataSubjectRepositories;
  readonly now: () => number;
  readonly writeFile?: (path: string, data: string) => void;
}

export const DATA_USAGE = `Data (your data · privacy):
  aurora data export [--out <file>]          Export all your data as a JSON
                                             snapshot (vocab, reviews, consent)
  aurora data erase                          Delete all your data (irreversible)
  aurora data prune --older-than <days>      Delete learning data past a retention
                    [--dry-run]              window (words + their cards; --dry-run
                                             previews without deleting)
  aurora data import <file> [--replace]      Import a JSON snapshot back (merge by
                                             default; --replace overwrites local)
`;

/** True when `argv[0]` is the data-subject command. */
export const isDataCommand = (command: string | undefined): boolean =>
  command === 'data';

/** Read `--out <file>` / `--out=<file>` if present. */
const parseOut = (args: readonly string[]): string | undefined => {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--out') {
      return args[i + 1];
    }
    if (arg.startsWith('--out=')) {
      return arg.slice('--out='.length);
    }
  }
  return undefined;
};

/**
 * `data export`: build a portable snapshot via {@link DataSubjectService} and
 * emit it as pretty JSON — to a file with `--out`, otherwise to stdout. The
 * snapshot holds only the user's own data (rule ①.E).
 */
const runExport = async (
  args: readonly string[],
  io: CliIO,
  deps: DataDeps,
): Promise<number> => {
  const service = new DataSubjectService(deps.repos);
  const snapshot = await service.export(deps.now());
  const json = JSON.stringify(snapshot, null, 2);
  const out = parseOut(args);
  if (out !== undefined && out !== '') {
    if (deps.writeFile === undefined) {
      io.writeError('error: --out is not supported here\n');
      return 2;
    }
    deps.writeFile(out, `${json}\n`);
    io.write(
      `wrote ${snapshot.vocab.length} word(s), ${snapshot.reviews.length} card(s), ` +
        `${snapshot.consent.length} consent record(s) to ${out}\n`,
    );
    return 0;
  }
  io.write(`${json}\n`);
  return 0;
};

/** `data erase`: delete all of the user's data (right to erasure). */
const runErase = async (io: CliIO, deps: DataDeps): Promise<number> => {
  await new DataSubjectService(deps.repos).erase();
  io.write('erased: all your data has been deleted\n');
  return 0;
};

interface PruneArgs {
  readonly olderThanDays: number | undefined;
  readonly dryRun: boolean;
}

/** Read `--older-than <days>` / `--older-than=<days>` and the `--dry-run` flag. */
const parsePrune = (args: readonly string[]): PruneArgs => {
  let olderThanDays: number | undefined;
  let dryRun = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg === '--older-than') {
      olderThanDays = Number(args[i + 1]);
      i += 1;
    } else if (arg.startsWith('--older-than=')) {
      olderThanDays = Number(arg.slice('--older-than='.length));
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }
  return { olderThanDays, dryRun };
};

/**
 * `data prune`: enforce storage limitation by deleting learning data older than
 * the retention window via {@link RetentionService}. Deletes only the user's own
 * words and their review cards — never consent/credentials (rule ①.E). `--dry-run`
 * previews the counts without touching the store.
 */
const runPrune = async (
  args: readonly string[],
  io: CliIO,
  deps: DataDeps,
): Promise<number> => {
  const { olderThanDays, dryRun } = parsePrune(args);
  if (
    olderThanDays === undefined ||
    !Number.isFinite(olderThanDays) ||
    olderThanDays <= 0
  ) {
    io.writeError(
      'error: --older-than <days> is required and must be a number > 0\n',
    );
    return 2;
  }
  const policy: RetentionPolicy = { maxAgeMs: olderThanDays * DAY_MS };
  const report = await new RetentionService(deps.repos).prune(
    deps.now(),
    policy,
    { dryRun },
  );
  const verb = report.dryRun ? 'would delete' : 'deleted';
  io.write(
    `${verb} ${report.deletedVocab.length} word(s) and ` +
      `${report.deletedReviews.length} card(s) older than ${olderThanDays}d ` +
      `(kept ${report.retainedVocab} word(s))\n`,
  );
  return 0;
};

interface ImportArgs {
  readonly file: string | undefined;
  readonly replace: boolean;
}

/** Read the positional `<file>` and the `--replace` flag. */
const parseImport = (args: readonly string[]): ImportArgs => {
  let file: string | undefined;
  let replace = false;
  for (const arg of args) {
    if (arg === '--replace') {
      replace = true;
    } else if (!arg.startsWith('--')) {
      file ??= arg;
    }
  }
  return { file, replace };
};

/**
 * `data import`: read a JSON {@link DataExport} snapshot and write it back via
 * {@link DataSubjectService} — the other half of data portability. Merges by
 * default (idempotent upsert); `--replace` erases local data first. Reading is
 * the injected `io.readFile` (DIP); a missing file, invalid JSON, or an
 * unsupported version is a friendly error with exit 2. Only the user's own data
 * fields are written — never credentials/config (rule ①.E).
 */
const runImport = async (
  args: readonly string[],
  io: CliIO,
  deps: DataDeps,
): Promise<number> => {
  const { file, replace } = parseImport(args);
  if (file === undefined) {
    io.writeError('error: missing <file>\n');
    return 2;
  }
  let raw: string;
  try {
    raw = io.readFile(file);
  } catch (cause) {
    io.writeError(`error: cannot read "${file}": ${(cause as Error).message}\n`);
    return 2;
  }
  let snapshot: DataExport;
  try {
    snapshot = JSON.parse(raw) as DataExport;
  } catch {
    io.writeError(`error: "${file}" is not valid JSON\n`);
    return 2;
  }
  let report;
  try {
    report = await new DataSubjectService(deps.repos).import(snapshot, {
      replace,
    });
  } catch (cause) {
    io.writeError(`error: ${(cause as Error).message}\n`);
    return 2;
  }
  const verb = report.replaced ? 'replaced with' : 'imported';
  io.write(
    `${verb} ${report.importedVocab} word(s), ` +
      `${report.importedReviews} card(s), ` +
      `${report.importedConsent} consent record(s)\n`,
  );
  return 0;
};

/** Dispatch a data subcommand. Assumes {@link isDataCommand}(argv[0]). */
export const runData = (
  argv: readonly string[],
  io: CliIO,
  deps: DataDeps,
): Promise<number> => {
  if (argv[1] === 'export') {
    return runExport(argv.slice(2), io, deps);
  }
  if (argv[1] === 'erase') {
    return runErase(io, deps);
  }
  if (argv[1] === 'prune') {
    return runPrune(argv.slice(2), io, deps);
  }
  if (argv[1] === 'import') {
    return runImport(argv.slice(2), io, deps);
  }
  io.writeError(`error: unknown data subcommand\n${DATA_USAGE}`);
  return Promise.resolve(2);
};
