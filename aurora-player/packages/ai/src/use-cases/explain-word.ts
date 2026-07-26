import { DEFAULT_PROMPTS, type PromptConfig } from '../prompts.js';
import {
  cachedComplete,
  type CompletionDeps,
} from './cached-completion.js';

export interface ExplainWordDeps extends CompletionDeps {
  readonly prompts?: PromptConfig;
}

export interface ExplainWordInput {
  readonly word: string;
  readonly context?: string;
  readonly signal?: AbortSignal;
}

export interface WordExplanation {
  readonly word: string;
  readonly text: string;
  readonly providerId: string;
  readonly cached: boolean;
}

/**
 * Explain a word, optionally in the context it was seen in (plan/05 · ai
 * capability `ExplainWord`). The context is part of the prompt, so the same word
 * in different contexts caches separately.
 */
export const explainWord = async (
  deps: ExplainWordDeps,
  input: ExplainWordInput,
): Promise<WordExplanation> => {
  const prompts = deps.prompts ?? DEFAULT_PROMPTS;
  const prompt = prompts.explainWord(input.word, input.context);
  const done = await cachedComplete(deps, {
    kind: 'word',
    prompt,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });
  return {
    word: input.word,
    text: done.text,
    providerId: done.providerId,
    cached: done.cached,
  };
};
