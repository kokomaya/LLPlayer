import { ParseError, ok, type Result } from '@aurora/domain';
import type { SubMeta, SubtitleDocument, SubtitleLine } from '../model.js';
import { extensionOf, type ISubtitleParser, type ParseInput } from '../parser.js';

/** A `[mm:ss.xx]` / `[mm:ss:xx]` timestamp tag (frac = centi/milliseconds). */
const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const OFFSET_TAG = /\[offset:\s*([+-]?\d+)\]/i;
const TITLE_TAG = /\[ti:([^\]]*)\]/i;
/** Fallback duration for the final lyric line (no following start to bound it). */
const TRAILING_MS = 4000;

interface Cue {
  readonly startMs: number;
  readonly text: string;
}

/**
 * LRC (lyrics) parser. Supports multiple time tags per line, `[offset:±ms]`, and
 * `[ti:]` metadata; ID/metadata tags are ignored. LRC carries no explicit end
 * time, so each line ends where the next begins (the last line gets a small
 * trailing window). No word-level timings.
 */
export class LrcParser implements ISubtitleParser {
  readonly id = 'lrc';
  readonly extensions = ['lrc'] as const;

  canParse(input: ParseInput): boolean {
    if (extensionOf(input.filename) === 'lrc') {
      return true;
    }
    // A line beginning with a numeric time tag, and not an SRT/VTT/JSON file.
    if (input.content.includes('-->') || input.content.trimStart().startsWith('{')) {
      return false;
    }
    return /^\s*\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/m.test(input.content);
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const offsetMs = Number(OFFSET_TAG.exec(input.content)?.[1] ?? 0);
    const titleMatch = TITLE_TAG.exec(input.content);

    const cues: Cue[] = [];
    for (const raw of input.content.replace(/\r\n?/g, '\n').split('\n')) {
      const starts: number[] = [];
      // Collect every time tag on the line.
      for (const m of raw.matchAll(TIME_TAG)) {
        const min = Number(m[1]);
        const sec = Number(m[2]);
        const frac = m[3] ? Number(m[3].padEnd(3, '0')) : 0;
        // `[offset]` positive shifts lyrics earlier (spec: "+ shifts up").
        starts.push(Math.max(0, min * 60_000 + sec * 1000 + frac - offsetMs));
      }
      if (starts.length === 0) {
        continue;
      }
      const text = raw.replace(TIME_TAG, '').trim();
      if (text.length === 0) {
        continue; // metadata-only line
      }
      for (const startMs of starts) {
        cues.push({ startMs, text });
      }
    }

    cues.sort((a, b) => a.startMs - b.startMs);
    const lines: SubtitleLine[] = cues.map((cue, i) => {
      const next = cues[i + 1];
      const endMs = next ? next.startMs : cue.startMs + TRAILING_MS;
      return {
        id: String(i + 1),
        range: { startMs: cue.startMs, endMs: Math.max(cue.startMs, endMs) },
        text: cue.text,
      };
    });

    const title = titleMatch?.[1]?.trim();
    const meta: SubMeta = title ? { format: 'lrc', title } : { format: 'lrc' };
    return ok({ lines, meta, hasWordTimings: false });
  }
}
