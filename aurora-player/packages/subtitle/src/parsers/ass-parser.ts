import { ParseError, ok, parseClock, type Result } from '@aurora/domain';
import type { SubtitleDocument, SubtitleLine } from '../model.js';
import { extensionOf, type ISubtitleParser, type ParseInput } from '../parser.js';
import { makeLine, stripAssTags } from './util.js';

/** Default `[Events]` column order per the SSA/ASS spec (Text is always last). */
const DEFAULT_COLUMNS = [
  'layer',
  'start',
  'end',
  'style',
  'name',
  'marginl',
  'marginr',
  'marginv',
  'effect',
  'text',
];

/**
 * SubStation Alpha (.ass/.ssa) parser. Reads the `[Events]` section, honours the
 * `Format:` column order, and cleans override tags / line-break escapes
 * (semantic port of FlyleafLib `SubtitlesManager`). Word-level timings are not
 * part of ASS, so `hasWordTimings` is false.
 */
export class AssParser implements ISubtitleParser {
  readonly id = 'ass';
  readonly extensions = ['ass', 'ssa'] as const;

  canParse(input: ParseInput): boolean {
    const ext = extensionOf(input.filename);
    if (ext === 'ass' || ext === 'ssa') {
      return true;
    }
    return /\[Script Info\]/i.test(input.content) || /^\s*Dialogue:/m.test(input.content);
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const rows = input.content.replace(/\r\n?/g, '\n').split('\n');
    let columns = DEFAULT_COLUMNS;
    let inEvents = false;
    const lines: SubtitleLine[] = [];
    let counter = 0;

    for (const row of rows) {
      const trimmed = row.trim();
      if (/^\[.*\]$/.test(trimmed)) {
        inEvents = /^\[Events\]$/i.test(trimmed);
        continue;
      }
      if (!inEvents) {
        continue;
      }
      if (/^Format:/i.test(trimmed)) {
        columns = trimmed
          .slice('Format:'.length)
          .split(',')
          .map((c) => c.trim().toLowerCase());
        continue;
      }
      if (!/^Dialogue:/i.test(trimmed)) {
        continue;
      }

      const startIdx = columns.indexOf('start');
      const endIdx = columns.indexOf('end');
      if (startIdx === -1 || endIdx === -1) {
        continue;
      }
      // Text is the final column and may itself contain commas, so cap the split.
      const body = trimmed.slice('Dialogue:'.length);
      const parts = body.split(',');
      if (parts.length < columns.length) {
        continue;
      }
      const head = parts.slice(0, columns.length - 1).map((p) => p.trim());
      const rawText = parts.slice(columns.length - 1).join(',');

      const start = parseClock(head[startIdx] ?? '');
      const end = parseClock(head[endIdx] ?? '');
      if (!start.ok || !end.ok) {
        continue;
      }
      const text = stripAssTags(rawText);
      if (text.length === 0) {
        continue;
      }
      counter += 1;
      lines.push(makeLine(String(counter), start.value, end.value, text));
    }

    const sorted = [...lines].sort((a, b) => a.range.startMs - b.range.startMs);
    return ok({ lines: sorted, meta: { format: 'ass' }, hasWordTimings: false });
  }
}
