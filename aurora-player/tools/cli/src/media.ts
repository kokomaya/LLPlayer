import {
  summarizeMediaPackage,
  validateMediaPackage,
  type MediaPackage,
  type MediaPackageIssue,
  type MediaPackageValidation,
} from '@aurora/domain';
import type { CliIO } from './run.js';

/**
 * `aurora media validate <package.json>` — the CLI echo of the marketplace's
 * headless upload gate (plan · 媒体市场 C). It reads a candidate
 * {@link MediaPackage} JSON and runs the pure {@link validateMediaPackage},
 * surfacing exactly what a real `ICatalogBackend.upload` would enforce
 * ("上传必须自带播放全要素") — without any network or backend.
 *
 * This command is I/O-only (reads a file, writes a report), so it lives beside
 * the other io-only commands (`subs`, `play`) and needs no repositories,
 * database or credentials. Exit codes: 0 valid, 1 invalid/unreadable, 2 usage.
 */

export const MEDIA_USAGE = `Media marketplace:
  aurora media validate <package.json>       Check a media package can be uploaded
`;

/** True when `argv[0]` addresses the media commands. */
export const isMediaCommand = (command: string | undefined): boolean =>
  command === 'media';

const formatIssues = (issues: readonly MediaPackageIssue[]): string =>
  issues.map((i) => `  - ${i.requirement}: ${i.message}`).join('\n');

/** Render a validation verdict as a stable, human-readable report. */
export const formatValidation = (
  validation: MediaPackageValidation,
  pkg: MediaPackage,
): string => {
  const lines: string[] = [];
  if (validation.ok) {
    const summary = summarizeMediaPackage(pkg);
    lines.push(`valid: ${summary.id} — "${summary.title}" (${summary.sourceLang} → ${summary.learningLang})`);
  } else {
    lines.push(`invalid: ${validation.errors.length} blocking issue(s)`);
    lines.push(formatIssues(validation.errors));
  }
  if (validation.warnings.length > 0) {
    lines.push(`warnings (${validation.warnings.length}):`);
    lines.push(formatIssues(validation.warnings));
  }
  return lines.join('\n');
};

const runMediaValidate = (args: readonly string[], io: CliIO): number => {
  const file = args.find((a) => !a.startsWith('--'));
  if (file === undefined) {
    io.writeError(`error: missing <package.json>\n${MEDIA_USAGE}`);
    return 2;
  }

  let raw: string;
  try {
    raw = io.readFile(file);
  } catch (cause) {
    io.writeError(`error: cannot read "${file}": ${(cause as Error).message}\n`);
    return 1;
  }

  let pkg: MediaPackage;
  try {
    pkg = JSON.parse(raw) as MediaPackage;
  } catch (cause) {
    io.writeError(`error: "${file}" is not valid JSON: ${(cause as Error).message}\n`);
    return 1;
  }

  // `validateMediaPackage` is defensive against malformed/untrusted shapes, so a
  // partial or hostile object yields a report rather than a crash.
  const validation = validateMediaPackage(pkg);
  io.write(`${formatValidation(validation, pkg)}\n`);
  return validation.ok ? 0 : 1;
};

/** Dispatch a media subcommand. Assumes {@link isMediaCommand}(argv[0]). */
export const runMedia = (argv: readonly string[], io: CliIO): number => {
  if (argv[1] === 'validate') {
    return runMediaValidate(argv.slice(2), io);
  }
  io.writeError(`error: unknown media subcommand\n${MEDIA_USAGE}`);
  return 2;
};
