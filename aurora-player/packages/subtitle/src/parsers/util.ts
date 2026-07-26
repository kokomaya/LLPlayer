import type { TimeRange } from '@aurora/domain';
import type { SubtitleLine } from '../model.js';

/** Normalizes CRLF/CR to LF and splits into blank-line-separated blocks. */
export const splitBlocks = (content: string): string[] => {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map((b) => b.replace(/^\n+|\n+$/g, ''))
    .filter((b) => b.trim().length > 0);
};

/** Builds a line with a always-valid range (end is clamped to >= start). */
export const makeLine = (
  id: string,
  startMs: number,
  endMs: number,
  text: string,
): SubtitleLine => {
  const range: TimeRange = { startMs, endMs: Math.max(startMs, endMs) };
  return { id, range, text };
};

/** Rounds a floating-point seconds value (Whisper JSON) to whole ms. */
export const secondsToMs = (seconds: number): number => Math.round(seconds * 1000);

/**
 * Strips SSA/ASS inline override blocks (`{\pos(..)}`, `{\i1}`, …) and unescapes
 * the line-break / hard-space escapes into real characters. Mirrors the cleanup
 * FlyleafLib's `SubtitlesManager` applies before display.
 */
export const stripAssTags = (raw: string): string =>
  raw
    .replace(/\{[^}]*\}/g, '') // override blocks
    .replace(/\\N/g, '\n') // hard line break
    .replace(/\\n/g, '\n') // soft line break (treated as break)
    .replace(/\\h/g, ' ') // hard space
    .trim();

/** Parses JSON, returning `undefined` instead of throwing on malformed input. */
export const tryParseJson = (content: string): unknown => {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
};

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/** Reads a finite number, or `undefined` when the value is not one. */
export const finiteNumber = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
