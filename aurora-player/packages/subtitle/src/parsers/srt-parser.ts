import { ParseError, ok, parseClock, type Result } from '@aurora/domain';
import type { SubtitleDocument, SubtitleLine } from '../model.js';
import { extensionOf, type ISubtitleParser, type ParseInput } from '../parser.js';
import { makeLine, splitBlocks } from './util.js';

const TIMECODE = /(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{1,3})/;

/**
 * SubRip (.srt) parser. Semantic port of FlyleafLib's text-subtitle reading:
 * numeric index line is optional, the `-->` line carries the times, remaining
 * lines are the (multi-line) cue text; empty cues are dropped.
 */
export class SrtParser implements ISubtitleParser {
  readonly id = 'srt';
  readonly extensions = ['srt'] as const;

  canParse(input: ParseInput): boolean {
    if (extensionOf(input.filename) === 'srt') {
      return true;
    }
    return /\d{1,2}:\d{2}:\d{2},\d{1,3}\s*-->/.test(input.content);
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const lines: SubtitleLine[] = [];
    let counter = 0;

    for (const block of splitBlocks(input.content)) {
      const blockLines = block.split('\n');
      const tcIndex = blockLines.findIndex((l) => TIMECODE.test(l));
      if (tcIndex === -1) {
        continue;
      }
      const match = TIMECODE.exec(blockLines[tcIndex]!);
      if (!match) {
        continue;
      }
      const start = parseClock(match[1]!);
      const end = parseClock(match[2]!);
      if (!start.ok || !end.ok) {
        continue;
      }
      const text = blockLines
        .slice(tcIndex + 1)
        .join('\n')
        .trim();
      if (text.length === 0) {
        continue;
      }
      counter += 1;
      lines.push(makeLine(String(counter), start.value, end.value, text));
    }

    // Timeline binary search relies on start-ascending order.
    const sorted = [...lines].sort((a, b) => a.range.startMs - b.range.startMs);
    return ok({
      lines: sorted,
      meta: { format: 'srt' },
      hasWordTimings: false,
    });
  }
}
