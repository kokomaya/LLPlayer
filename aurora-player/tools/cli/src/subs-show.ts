import { flattenText, type SubtitleDocument } from '@aurora/subtitle';
import { SubtitleTimeline, type PositionState } from '@aurora/timeline';

/** Result of querying a subtitle document at a point in time. */
export interface SubsShowResult {
  readonly atMs: number;
  readonly state: PositionState;
  readonly current: string | null;
  readonly prev: string | null;
  readonly next: string | null;
}

/**
 * The composition root for slice A: wire the subtitle document into the
 * timeline cursor and read off the sentence context at `atMs`. Pure — no I/O —
 * so it can be unit-tested directly.
 */
export const querySubtitleAt = (
  doc: SubtitleDocument,
  atMs: number,
): SubsShowResult => {
  const timeline = new SubtitleTimeline(doc.lines).seek(atMs);
  const flat = (text: string | undefined): string | null =>
    text === undefined ? null : flattenText(text);
  return {
    atMs,
    state: timeline.state,
    current: flat(timeline.currentLine()?.text),
    prev: flat(timeline.prevLine()?.text),
    next: flat(timeline.nextLine()?.text),
  };
};

/** Renders a {@link SubsShowResult} as human-readable lines. */
export const formatSubsShow = (r: SubsShowResult): string => {
  const lines = [`@ ${r.atMs}ms  [${r.state}]`];
  if (r.current !== null) {
    lines.push(`▶ ${r.current}`);
  } else {
    lines.push('▶ (no subtitle showing)');
    if (r.prev !== null) {
      lines.push(`  prev: ${r.prev}`);
    }
    if (r.next !== null) {
      lines.push(`  next: ${r.next}`);
    }
  }
  return lines.join('\n');
};
