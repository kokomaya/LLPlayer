import type { LanguageCode } from '@aurora/domain';
import type { SubtitleDocument } from './model.js';

/**
 * Platform-agnostic input for transcription (plan/04 · capability interfaces).
 * The core never decodes audio: it hands an opaque media reference (and, when a
 * caller has already decoded them, raw PCM `samples`) to a provider. Real audio
 * loading/decoding lives behind a `.example` adapter or the composition root —
 * the pure core and its tests only ever see this shape.
 */
export interface TranscribeInput {
  readonly mediaId: string;
  /** Optional pre-decoded mono PCM samples; opaque to the core. */
  readonly samples?: readonly number[];
}

/**
 * Port for an ASR/transcription backend — the OCP/DIP seam for "video with no
 * subtitles → word-timed {@link SubtitleDocument}" (plan/04 · `ISubtitleProvider`;
 * plan/07 · M5). A new engine (whisper.cpp, whisper.rn, a hosted ASR service, or
 * an offline stub) is a new implementation of this one port; downstream code
 * (timeline, learning) only ever sees the unified document, never the engine.
 */
export interface ISubtitleProvider {
  readonly id: string;
  /**
   * Produce a {@link SubtitleDocument} for `input` in `lang`. Offline/stub
   * providers are deterministic; real engines may be non-deterministic and are
   * validated off-CI behind `.example`.
   */
  transcribe(input: TranscribeInput, lang: LanguageCode): Promise<SubtitleDocument>;
}
