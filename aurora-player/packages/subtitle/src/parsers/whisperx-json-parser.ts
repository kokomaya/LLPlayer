import { ParseError, err, ok, type Result } from '@aurora/domain';
import type { SubMeta, SubtitleDocument, SubtitleLine, Word } from '../model.js';
import type { ISubtitleParser, ParseInput } from '../parser.js';
import { finiteNumber, isRecord, secondsToMs, tryParseJson } from './util.js';

/**
 * WhisperX JSON (word-aligned Whisper). Distinguished from plain Whisper by a
 * top-level `word_segments` array. Each segment becomes a line whose `words`
 * carry per-word {@link Word.range}s (times in seconds → ms); words the aligner
 * left untimed (often punctuation) keep their text but omit a range. This is the
 * one format that sets `hasWordTimings: true`.
 */
export class WhisperXJsonParser implements ISubtitleParser {
  readonly id = 'whisperx-json';
  readonly extensions = ['json'] as const;

  canParse(input: ParseInput): boolean {
    const obj = tryParseJson(input.content);
    return (
      isRecord(obj) &&
      Array.isArray(obj['segments']) &&
      Array.isArray(obj['word_segments'])
    );
  }

  parse(input: ParseInput): Result<SubtitleDocument, ParseError> {
    const obj = tryParseJson(input.content);
    if (!isRecord(obj) || !Array.isArray(obj['segments'])) {
      return err(new ParseError('Not a WhisperX JSON document (missing segments)'));
    }

    const lines: SubtitleLine[] = [];
    let counter = 0;
    for (const seg of obj['segments']) {
      if (!isRecord(seg)) {
        continue;
      }
      const text = typeof seg['text'] === 'string' ? seg['text'].trim() : '';
      const words = this.#readWords(seg['words']);

      // Segment bounds: explicit if given, else spanned from the words.
      const isNum = (n: number | undefined): n is number => n !== undefined;
      const wordStarts = words.map((w) => w.range?.startMs).filter(isNum);
      const wordEnds = words.map((w) => w.range?.endMs).filter(isNum);
      const start = finiteNumber(seg['start']);
      const startMs = start !== undefined ? secondsToMs(start) : Math.min(...wordStarts);
      const end = finiteNumber(seg['end']);
      const endMs = end !== undefined ? secondsToMs(end) : Math.max(...wordEnds);

      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || text.length === 0) {
        continue;
      }
      counter += 1;
      lines.push({
        id: String(counter),
        range: { startMs, endMs: Math.max(startMs, endMs) },
        text,
        words,
      });
    }

    lines.sort((a, b) => a.range.startMs - b.range.startMs);
    const language = typeof obj['language'] === 'string' ? obj['language'] : undefined;
    const meta: SubMeta = language
      ? { format: 'whisperx-json', language }
      : { format: 'whisperx-json' };
    return ok({ lines, meta, hasWordTimings: true });
  }

  #readWords(raw: unknown): Word[] {
    if (!Array.isArray(raw)) {
      return [];
    }
    const words: Word[] = [];
    for (const w of raw) {
      if (!isRecord(w)) {
        continue;
      }
      const text = typeof w['word'] === 'string' ? w['word'].trim() : '';
      if (text.length === 0) {
        continue;
      }
      const start = finiteNumber(w['start']);
      const end = finiteNumber(w['end']);
      if (start !== undefined && end !== undefined) {
        const startMs = secondsToMs(start);
        words.push({ text, range: { startMs, endMs: Math.max(startMs, secondsToMs(end)) } });
      } else {
        words.push({ text });
      }
    }
    return words;
  }
}
