// Build copyable plain text from subtitle lines — the headless half of "复制字幕"
// (copy subtitles). A device binding (e.g. expo-clipboard) calls one of these to
// turn a selection into a clipboard string; all formatting decisions live here
// so they are Node-testable. Pure — strings in, a string out.

import type { SubtitleLine, Word } from './model.js';

/** Formatting options for {@link copyLineText} / {@link copyLinesText}. */
export interface CopyTextOptions {
  /** Prefix each line with its `[hh:mm:ss.mmm]` start time. Default false. */
  readonly withTimestamps?: boolean;
  /** Append each line's `translated` text (if present) on its own line. Default false. */
  readonly withTranslation?: boolean;
  /** Separator joining multiple lines. Default `'\n'`. */
  readonly separator?: string;
}

/**
 * Format `ms` as `hh:mm:ss.mmm` (zero-padded, hours unbounded). Negative inputs
 * are clamped to zero so a stray position never yields a malformed stamp.
 */
export const formatTimestamp = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  const pad = (n: number, width = 2): string => String(n).padStart(width, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(millis, 3)}`;
};

/** The plain text of a single word (its surface form). */
export const copyWordText = (word: Word): string => word.text;

/**
 * Copyable text for one line: the cue text, optionally prefixed with its start
 * timestamp and/or followed by its translation on the next line.
 */
export const copyLineText = (line: SubtitleLine, options: CopyTextOptions = {}): string => {
  const head = options.withTimestamps
    ? `[${formatTimestamp(line.range.startMs)}] ${line.text}`
    : line.text;
  if (options.withTranslation && line.translated !== undefined && line.translated !== '') {
    return `${head}\n${line.translated}`;
  }
  return head;
};

/**
 * Copyable text for a run of lines, each formatted by {@link copyLineText} and
 * joined by `options.separator` (default a newline).
 */
export const copyLinesText = (
  lines: readonly SubtitleLine[],
  options: CopyTextOptions = {},
): string =>
  lines.map((line) => copyLineText(line, options)).join(options.separator ?? '\n');
