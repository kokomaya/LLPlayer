import { ParseError, ok, parseClock, type Result } from '@aurora/domain';
import type { SubtitleDocument, SubtitleLine } from '../model.js';
import { extensionOf, type ISubtitleParser, type ParseInput } from '../parser.js';
import { makeLine, splitBlocks } from './util.js';

const CUE_TAGS = /<[^>]*>/g;
/** Leading UTF-8 BOM (U+FEFF), as an escape to avoid a literal char in source. */
const LEADING_BOM = /^\uFEFF/;
const NON_CUE = /^(NOTE|STYLE|REGION)\b/;

/**
 * WebVTT (.vtt) parser. Skips the `WEBVTT` header and NOTE/STYLE/REGION blocks,
 * tolerates an optional cue-identifier line and trailing cue settings after the
 * end timestamp, and strips inline cue tags (`<c>`, `<i>`, karaoke timestamps).
 */
export class VttParser implements ISubtitleParser {
  readonly id = 'vtt';
  readonly extensions = ['vtt'] as const;

  canParse(input: ParseInput): boolean {
    if (extensionOf(input.filename) === 'vtt') {
      return true;
    }
    return input.content.replace(LEADING_BOM, '').trimStart().startsWith('WEBVTT');
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const content = input.content.replace(LEADING_BOM, '');
    const lines: SubtitleLine[] = [];
    let counter = 0;

    for (const block of splitBlocks(content)) {
      // Header and metadata blocks are not cues.
      if (block.startsWith('WEBVTT') || NON_CUE.test(block)) {
        continue;
      }
      const blockLines = block.split('\n');
      const tcIndex = blockLines.findIndex((l) => l.includes('-->'));
      if (tcIndex === -1) {
        continue;
      }
      const tcLine = blockLines[tcIndex]!;
      const [rawStart, rest] = tcLine.split('-->');
      if (rawStart === undefined || rest === undefined) {
        continue;
      }
      // The end timestamp is the first token after `-->`; drop cue settings.
      const rawEnd = rest.trim().split(/\s+/)[0] ?? '';
      const start = parseClock(rawStart.trim());
      const end = parseClock(rawEnd);
      if (!start.ok || !end.ok) {
        continue;
      }
      const text = blockLines
        .slice(tcIndex + 1)
        .join('\n')
        .replace(CUE_TAGS, '')
        .trim();
      if (text.length === 0) {
        continue;
      }
      counter += 1;
      lines.push(makeLine(String(counter), start.value, end.value, text));
    }

    const sorted = [...lines].sort((a, b) => a.range.startMs - b.range.startMs);
    return ok({
      lines: sorted,
      meta: { format: 'vtt' },
      hasWordTimings: false,
    });
  }
}
