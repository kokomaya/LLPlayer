// Reference-only: the REAL ASR backend. Excluded from tsconfig/vitest and CI
// because it needs a downloaded model + a native/network runtime (plan/07 · M5;
// rule ①.C.12, ①.E). It is the OCP proof that a real engine drops in behind the
// same `ISubtitleProvider` the offline stub implements — no core/use-case change.
//
// The model path and any endpoint/key come from the environment or an
// untracked file — NEVER committed (rule ①.E). Validate on a real machine, not
// in CI. This file is prose, not part of the typechecked graph.

import type {
  ISubtitleProvider,
  SubtitleDocument,
  TranscribeInput,
} from '@aurora/subtitle';
import type { LanguageCode } from '@aurora/domain';

// e.g. `import { Whisper } from 'whisper.cpp-node';` — a real native binding.
declare const loadWhisper: (modelPath: string) => {
  transcribe(
    samples: readonly number[],
    lang: string,
  ): Promise<{ segments: { text: string; startMs: number; endMs: number }[] }>;
};

export class WhisperCppProvider implements ISubtitleProvider {
  readonly id = 'whisper-cpp';
  readonly #modelPath: string;

  constructor(modelPath = process.env.WHISPER_MODEL_PATH ?? '') {
    if (!modelPath) {
      throw new Error('WHISPER_MODEL_PATH is required (do not commit it)');
    }
    this.#modelPath = modelPath;
  }

  async transcribe(
    input: TranscribeInput,
    lang: LanguageCode,
  ): Promise<SubtitleDocument> {
    const engine = loadWhisper(this.#modelPath);
    const result = await engine.transcribe(input.samples ?? [], lang);
    // Map segments → SubtitleDocument (word alignment via a second pass in the
    // real impl). Shape identical to the offline provider so the same contract,
    // timeline, and learning loop consume it unchanged.
    const lines = result.segments.map((s, i) => ({
      id: `w${i + 1}`,
      range: { startMs: s.startMs, endMs: s.endMs },
      text: s.text.trim(),
    }));
    return { lines, meta: { format: 'whisper', language: lang }, hasWordTimings: false };
  }
}
