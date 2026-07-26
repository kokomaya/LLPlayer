import { ParseError, err, ok, type Result } from '@aurora/domain';
import type { SubMeta, SubtitleDocument, SubtitleLine } from '../model.js';
import type { ISubtitleParser, ParseInput } from '../parser.js';
import { finiteNumber, isRecord, makeLine, secondsToMs, tryParseJson } from './util.js';

/**
 * OpenAI Whisper transcription JSON (`{ segments: [{ start, end, text }], … }`,
 * times in seconds). Segment-level only — word timings, when present, are left
 * to the {@link WhisperXJsonParser}; this parser reports `hasWordTimings: false`.
 */
export class WhisperJsonParser implements ISubtitleParser {
  readonly id = 'whisper-json';
  readonly extensions = ['json'] as const;

  canParse(input: ParseInput): boolean {
    const obj = tryParseJson(input.content);
    if (!isRecord(obj) || !Array.isArray(obj['segments'])) {
      return false;
    }
    // Decline WhisperX output so the more specific parser handles it.
    if (Array.isArray(obj['word_segments'])) {
      return false;
    }
    return obj['segments'].some(
      (s) => isRecord(s) && finiteNumber(s['start']) !== undefined,
    );
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const obj = tryParseJson(input.content);
    if (!isRecord(obj) || !Array.isArray(obj['segments'])) {
      return err(new ParseError('Not a Whisper JSON document (missing segments)'));
    }

    const lines: SubtitleLine[] = [];
    let counter = 0;
    for (const seg of obj['segments']) {
      if (!isRecord(seg)) {
        continue;
      }
      const start = finiteNumber(seg['start']);
      const end = finiteNumber(seg['end']);
      const text = typeof seg['text'] === 'string' ? seg['text'].trim() : '';
      if (start === undefined || end === undefined || text.length === 0) {
        continue;
      }
      counter += 1;
      lines.push(makeLine(String(counter), secondsToMs(start), secondsToMs(end), text));
    }

    lines.sort((a, b) => a.range.startMs - b.range.startMs);
    const language = typeof obj['language'] === 'string' ? obj['language'] : undefined;
    const meta: SubMeta = language
      ? { format: 'whisper-json', language }
      : { format: 'whisper-json' };
    return ok({ lines, meta, hasWordTimings: false });
  }
}
