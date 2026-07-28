import { flattenText, type SubtitleLine } from '@aurora/subtitle';
import { WordCursor } from '@aurora/timeline';

// View models + pure builders for the multi-mode subtitle surface (plan/04 —
// "thin bindings, thick testables"). A player screen may show subtitles as an
// overlay (single active line over the video), as a scrollable LIST below the
// video (portrait, subx-style), or FULLSCREEN with a fixed number of source
// lines. All three render the same word-addressable model built here, so a tap
// on any word already knows its seek target and every layout/window decision is
// unit-tested in Node — never re-derived in a `.tsx`.

/** How the subtitle surface is laid out. */
export type SubtitleDisplayMode = 'overlay' | 'list' | 'fullscreen';

/** A single tappable word within a line. */
export interface SubtitleWordVM {
  readonly text: string;
  /** Index of the word within its line (reading order). */
  readonly wordIndex: number;
  /** Absolute seek target in ms — the (resolved) start of this word. */
  readonly targetMs: number;
  /** True when the timing was char-length interpolated, not read from source. */
  readonly estimated: boolean;
}

/** One source subtitle line (may visually wrap into several rows in the UI). */
export interface SubtitleLineVM {
  readonly id: string;
  /** Index of the line in document order (the unit `lineCount` counts). */
  readonly lineIndex: number;
  readonly startMs: number;
  readonly endMs: number;
  /** Flattened plain text — the fallback render when words aren't tapped. */
  readonly text: string;
  /** Tappable words; empty when the line has no resolvable words. */
  readonly words: readonly SubtitleWordVM[];
  /** Translation line if the source carried one, else `null`. */
  readonly translated: string | null;
}

/** A half-open `[start, end)` slice of the line list (for fullscreen windowing). */
export interface LineWindow {
  readonly start: number;
  readonly end: number;
}

/**
 * Resolve `lines` into the word-addressable list model both the list and
 * fullscreen views render. Reuses {@link WordCursor} so words inherit the same
 * real-timing / char-interpolation resolution (and `estimated` flag) as playback
 * highlighting — a tapped word seeks to exactly where the highlight would land.
 * Pure and stateless: build once per document.
 */
export const buildSubtitleLineVMs = (
  lines: readonly SubtitleLine[],
): SubtitleLineVM[] => {
  // WordCursor.words is flattened + globally start-sorted and each hit carries a
  // reference to its source line plus its per-line wordIndex. Bucket by line so
  // we can restore document order (lines) and reading order (wordIndex) without
  // re-implementing the resolver.
  const byLine = new Map<SubtitleLine, SubtitleWordVM[]>();
  for (const hit of new WordCursor(lines).words) {
    const bucket = byLine.get(hit.line as SubtitleLine) ?? [];
    bucket.push({
      text: hit.text,
      wordIndex: hit.wordIndex,
      targetMs: hit.range.startMs,
      estimated: hit.estimated,
    });
    byLine.set(hit.line as SubtitleLine, bucket);
  }

  return lines.map((line, lineIndex) => {
    const words = (byLine.get(line) ?? []).slice().sort((a, b) => a.wordIndex - b.wordIndex);
    return {
      id: line.id,
      lineIndex,
      startMs: line.range.startMs,
      endMs: line.range.endMs,
      text: flattenText(line.text),
      words,
      translated: line.translated !== undefined ? flattenText(line.translated) : null,
    };
  });
};

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * The `[start, end)` window of at most `count` lines to show in fullscreen,
 * centered on `activeIndex` and clamped to `[0, total)`. When `activeIndex` is
 * `null` (playhead in a gap / before the first line) the window anchors at the
 * top. `count <= 0` yields an empty window; `count >= total` shows everything.
 */
export const computeLineWindow = (
  activeIndex: number | null,
  total: number,
  count: number,
): LineWindow => {
  if (total <= 0 || count <= 0) {
    return { start: 0, end: 0 };
  }
  const size = Math.min(count, total);
  if (activeIndex === null) {
    return { start: 0, end: size };
  }
  const active = clamp(activeIndex, 0, total - 1);
  // Center the active line, then clamp the window into range so it never runs
  // off either end (keeps a full `size` lines visible).
  const half = Math.floor(size / 2);
  const start = clamp(active - half, 0, total - size);
  return { start, end: start + size };
};
