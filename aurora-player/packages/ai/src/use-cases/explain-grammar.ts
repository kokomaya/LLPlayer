import { DEFAULT_PROMPTS, type PromptConfig } from '../prompts.js';
import {
  cachedComplete,
  type CompletionDeps,
} from './cached-completion.js';

export interface ExplainGrammarDeps extends CompletionDeps {
  readonly prompts?: PromptConfig;
}

export interface ExplainGrammarInput {
  readonly text: string;
  readonly signal?: AbortSignal;
}

export interface GrammarExplanation {
  readonly sourceText: string;
  readonly text: string;
  readonly providerId: string;
  readonly cached: boolean;
}

/**
 * Explain the grammar of a sentence (plan/05 · ai capability `ExplainGrammar`).
 * Cached like the other capabilities.
 */
export const explainGrammar = async (
  deps: ExplainGrammarDeps,
  input: ExplainGrammarInput,
): Promise<GrammarExplanation> => {
  const prompts = deps.prompts ?? DEFAULT_PROMPTS;
  const prompt = prompts.explainGrammar(input.text);
  const done = await cachedComplete(deps, {
    kind: 'grammar',
    prompt,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });
  return {
    sourceText: input.text,
    text: done.text,
    providerId: done.providerId,
    cached: done.cached,
  };
};
