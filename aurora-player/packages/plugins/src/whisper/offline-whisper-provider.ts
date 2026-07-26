import { createTimeRange, type LanguageCode, type TimeRange } from '@aurora/domain';
import type {
  ISubtitleProvider,
  SubtitleDocument,
  SubtitleLine,
  TranscribeInput,
  Word,
} from '@aurora/subtitle';
import type { Plugin, PluginContext } from '../plugin.js';

/**
 * A fixed, word-timed transcript used as the deterministic stand-in for a real
 * ASR run. Two lines with per-word timings exercise the whole "no subtitles →
 * word-level document → learning loop" path (plan/07 · M5) with no model, no
 * audio, and no network — so it is fully unit-testable and CI-safe. The real
 * engine (whisper.cpp / whisper.rn / hosted ASR) lives in
 * `whisper-cpp-provider.example.ts` and is validated off-CI.
 */
const SCRIPT: readonly (readonly string[])[] = [
  ['hello', 'there'],
  ['this', 'is', 'aurora'],
];
const WORD_MS = 400;

/** Unwrap a known-valid range (SCRIPT timings are static and always valid). */
const range = (startMs: number, endMs: number): TimeRange => {
  const r = createTimeRange(startMs, endMs);
  if (!r.ok) {
    throw r.error;
  }
  return r.value;
};

/**
 * Offline {@link ISubtitleProvider}: synthesizes a canned word-level
 * {@link SubtitleDocument}. Deterministic (LSP-testable against the shared
 * contract) and platform-free; `input.mediaId` is recorded in `meta.title` for
 * traceability but does not affect timings.
 */
export class OfflineWhisperProvider implements ISubtitleProvider {
  readonly id = 'whisper-offline';

  transcribe(
    input: TranscribeInput,
    lang: LanguageCode,
  ): Promise<SubtitleDocument> {
    let cursor = 0;
    const lines: SubtitleLine[] = SCRIPT.map((tokens, i) => {
      const start = cursor;
      const words: Word[] = tokens.map((text) => {
        const wordStart = cursor;
        cursor += WORD_MS;
        return { text, lemma: text.toLowerCase(), range: range(wordStart, cursor) };
      });
      return {
        id: `w${i + 1}`,
        range: range(start, cursor),
        text: tokens.join(' '),
        words,
      };
    });

    return Promise.resolve({
      lines,
      meta: { format: 'whisper', language: lang, title: input.mediaId },
      hasWordTimings: true,
    });
  }
}

/**
 * Plugin wrapper contributing the {@link OfflineWhisperProvider} under the
 * `subtitle-provider` capability.
 */
export class WhisperPlugin implements Plugin {
  readonly id = 'whisper-offline';
  readonly version = '1.0.0';
  readonly capabilities = ['subtitle-provider'] as const;

  activate(ctx: PluginContext): void {
    ctx.registerSubtitleProvider(new OfflineWhisperProvider());
    ctx.log('registered offline Whisper provider');
  }
}
