import type { LanguageCode } from '@aurora/domain';
import { DEFAULT_PROMPTS, type PromptConfig } from '../prompts.js';
import {
  cachedComplete,
  type CompletionDeps,
} from './cached-completion.js';

export interface TranslateDeps extends CompletionDeps {
  /** Prompt templates; defaults to {@link DEFAULT_PROMPTS}. */
  readonly prompts?: PromptConfig;
}

export interface TranslateInput {
  readonly text: string;
  readonly targetLang: LanguageCode;
  readonly signal?: AbortSignal;
}

export interface TranslationResult {
  readonly sourceText: string;
  readonly targetLang: LanguageCode;
  readonly text: string;
  readonly providerId: string;
  readonly cached: boolean;
}

/**
 * Translate a subtitle line (plan/05 · ai capability `TranslateLine`). Prompt is
 * built from the configurable template, then the completion is cached so the
 * same line/target never hits the provider twice.
 */
export const translateLine = async (
  deps: TranslateDeps,
  input: TranslateInput,
): Promise<TranslationResult> => {
  const prompts = deps.prompts ?? DEFAULT_PROMPTS;
  const prompt = prompts.translate(input.text, input.targetLang);
  const done = await cachedComplete(deps, {
    kind: 'translate',
    prompt,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  });
  return {
    sourceText: input.text,
    targetLang: input.targetLang,
    text: done.text,
    providerId: done.providerId,
    cached: done.cached,
  };
};
