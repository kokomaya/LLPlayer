import type { LanguageCode } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import type { ISubtitleProvider, TranscribeInput } from '../provider.js';

/**
 * Reusable behaviour spec for {@link ISubtitleProvider} implementations
 * (plan/09 §1 "contract tests"). Every ASR backend — the offline stub now, a
 * real engine later — must pass this same suite, which is how LSP becomes
 * verifiable in CI: whatever the engine, the {@link SubtitleDocument} it emits
 * is structurally valid (start-sorted lines, well-formed word ranges, a
 * `hasWordTimings` flag that matches reality) so the timeline and learning loop
 * can consume it unchanged.
 */
export interface SubtitleProviderContractCase {
  readonly name: string;
  readonly makeProvider: () => ISubtitleProvider;
  readonly input: TranscribeInput;
  readonly lang: LanguageCode;
  readonly minLines?: number;
  /** True when this provider is expected to emit word-level timings. */
  readonly expectWordTimings?: boolean;
}

export const runSubtitleProviderContract = (
  testCase: SubtitleProviderContractCase,
): void => {
  describe(`ISubtitleProvider contract: ${testCase.name}`, () => {
    it('emits a well-formed, start-sorted document', async () => {
      const doc = await testCase
        .makeProvider()
        .transcribe(testCase.input, testCase.lang);

      expect(doc.lines.length).toBeGreaterThanOrEqual(testCase.minLines ?? 1);

      const ids = new Set<string>();
      let prevStart = Number.NEGATIVE_INFINITY;
      let anyWords = false;
      for (const line of doc.lines) {
        expect(line.id.length).toBeGreaterThan(0);
        expect(ids.has(line.id)).toBe(false);
        ids.add(line.id);
        expect(line.text.length).toBeGreaterThan(0);
        expect(line.range.endMs).toBeGreaterThanOrEqual(line.range.startMs);
        expect(line.range.startMs).toBeGreaterThanOrEqual(prevStart);
        prevStart = line.range.startMs;

        for (const word of line.words ?? []) {
          expect(word.text.length).toBeGreaterThan(0);
          if (word.range) {
            anyWords = true;
            expect(word.range.endMs).toBeGreaterThanOrEqual(word.range.startMs);
            expect(word.range.startMs).toBeGreaterThanOrEqual(line.range.startMs);
            expect(word.range.endMs).toBeLessThanOrEqual(line.range.endMs);
          }
        }
      }
      expect(doc.hasWordTimings).toBe(anyWords);
      if (testCase.expectWordTimings) {
        expect(anyWords).toBe(true);
      }
    });

    it('stamps the source format in meta', async () => {
      const doc = await testCase
        .makeProvider()
        .transcribe(testCase.input, testCase.lang);
      expect(doc.meta.format.length).toBeGreaterThan(0);
    });
  });
};
