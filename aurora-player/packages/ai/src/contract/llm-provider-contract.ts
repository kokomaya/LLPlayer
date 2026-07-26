import { describe, expect, it } from 'vitest';
import type { ILLMProvider } from '../port.js';

/**
 * Reusable behaviour spec for {@link ILLMProvider} implementations (plan/09 §1;
 * plan/05 · ai "切换 Provider 不改用例"). Any provider that passes is a drop-in
 * substitute behind the runtime and the use-cases (LSP): the same
 * {@link LLMRequest} yields a structurally consistent {@link LLMResponse}, the
 * call is side-effect-free, and the response is stamped with the provider's own
 * id.
 */
export interface LLMProviderContractCase {
  readonly name: string;
  readonly makeProvider: () => ILLMProvider;
  /** A prompt the provider will complete. */
  readonly prompt: string;
}

export const runLLMProviderContract = (
  testCase: LLMProviderContractCase,
): void => {
  describe(`ILLMProvider contract: ${testCase.name}`, () => {
    it('returns non-empty text stamped with its own id', async () => {
      const provider = testCase.makeProvider();
      const res = await provider.complete({ prompt: testCase.prompt });
      expect(res.text.length).toBeGreaterThan(0);
      expect(res.providerId).toBe(provider.id);
    });

    it('is pure — repeating a request yields an equal response', async () => {
      const provider = testCase.makeProvider();
      const a = await provider.complete({ prompt: testCase.prompt });
      const b = await provider.complete({ prompt: testCase.prompt });
      expect(b).toEqual(a);
    });

    it('varies its text with the prompt', async () => {
      const provider = testCase.makeProvider();
      const a = await provider.complete({ prompt: testCase.prompt });
      const b = await provider.complete({ prompt: `${testCase.prompt} (more)` });
      expect(b.text).not.toBe(a.text);
    });
  });
};
