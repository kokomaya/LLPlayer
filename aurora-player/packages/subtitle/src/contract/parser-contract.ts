import { describe, expect, it } from 'vitest';
import type { ISubtitleParser, ParseInput } from '../parser.js';

/**
 * Reusable behaviour spec for {@link ISubtitleParser} implementations
 * (plan/09 §1 "contract tests"). Every parser — current and future — must pass
 * this same suite, which is how LSP becomes verifiable in CI.
 */
export interface SubtitleParserContractCase {
  readonly name: string;
  readonly makeParser: () => ISubtitleParser;
  /** A sample the parser is expected to accept and parse. */
  readonly valid: ParseInput;
  readonly minLines?: number;
  /** A foreign sample the parser must decline via `canParse`. */
  readonly rejects?: ParseInput;
}

export const runSubtitleParserContract = (
  testCase: SubtitleParserContractCase,
): void => {
  describe(`ISubtitleParser contract: ${testCase.name}`, () => {
    it('canParse accepts its own format', () => {
      expect(testCase.makeParser().canParse(testCase.valid)).toBe(true);
    });

    it('parse yields a well-formed, start-sorted document', () => {
      const result = testCase.makeParser().parse(testCase.valid);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const { lines } = result.value;
      expect(lines.length).toBeGreaterThanOrEqual(testCase.minLines ?? 1);

      const ids = new Set<string>();
      let prevStart = Number.NEGATIVE_INFINITY;
      for (const line of lines) {
        expect(line.id.length).toBeGreaterThan(0);
        expect(ids.has(line.id)).toBe(false);
        ids.add(line.id);
        expect(line.range.endMs).toBeGreaterThanOrEqual(line.range.startMs);
        expect(line.range.startMs).toBeGreaterThanOrEqual(prevStart);
        prevStart = line.range.startMs;
        expect(line.text.length).toBeGreaterThan(0);
      }
    });

    if (testCase.rejects) {
      it('canParse declines a foreign format', () => {
        expect(testCase.makeParser().canParse(testCase.rejects!)).toBe(false);
      });
    }
  });
};
