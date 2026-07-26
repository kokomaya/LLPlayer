import { flattenText, type SubtitleDocument } from '@aurora/subtitle';
import { SubtitleTimeline, WordCursor } from '@aurora/timeline';

/** Result of querying the active word (and line) at a point in time. */
export interface SubsWordsResult {
  readonly atMs: number;
  readonly line: string | null;
  readonly word: string | null;
  /** True when the word range was interpolated rather than read from the file. */
  readonly estimated: boolean;
  /** Whether the source document carries real word-level timings. */
  readonly hasWordTimings: boolean;
}

/**
 * Composition root for `subs words`: feed the parsed document into both the
 * sentence cursor and the word cursor and read off the line + word at `atMs`.
 * Pure — no I/O — so it can be unit-tested directly.
 */
export const queryWordAt = (
  doc: SubtitleDocument,
  atMs: number,
): SubsWordsResult => {
  const line = new SubtitleTimeline(doc.lines).seek(atMs).currentLine();
  const hit = new WordCursor(doc.lines).currentWord(atMs);
  return {
    atMs,
    line: line ? flattenText(line.text) : null,
    word: hit ? hit.text : null,
    estimated: hit ? hit.estimated : false,
    hasWordTimings: doc.hasWordTimings,
  };
};

/** Renders a {@link SubsWordsResult} as human-readable lines. */
export const formatSubsWords = (r: SubsWordsResult): string => {
  const lineStr = r.line !== null ? r.line : '(no subtitle showing)';
  const wordStr =
    r.word !== null
      ? `${r.word}${r.estimated ? ' (estimated)' : ''}`
      : '(no word)';
  const timings = r.hasWordTimings ? 'word-timed' : 'sentence-only';
  return [`@ ${r.atMs}ms  [${timings}]`, `▶ ${lineStr}`, `• word: ${wordStr}`].join(
    '\n',
  );
};
