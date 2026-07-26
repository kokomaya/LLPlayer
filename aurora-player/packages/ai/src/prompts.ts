import type { LanguageCode } from '@aurora/domain';

/**
 * Prompt templates for the AI capability domain (plan/05 · ai "Prompt 模板可
 * 配置"). Injectable so callers can align them with the desktop app's
 * `TranslateChatConfig` semantics (plan/06) or a plugin without touching the
 * use-cases (OCP). The defaults below are plain, deterministic strings — the
 * exact text also feeds the cache key, so changing a template invalidates its
 * cached results by construction.
 */
export interface PromptConfig {
  translate(text: string, targetLang: LanguageCode): string;
  explainGrammar(text: string): string;
  explainWord(word: string, context?: string): string;
}

export const DEFAULT_PROMPTS: PromptConfig = {
  translate: (text, targetLang) =>
    `Translate the following text into ${targetLang}. Reply with only the translation.\n\n${text}`,
  explainGrammar: (text) =>
    `Explain the grammar of the following sentence for a language learner, concisely.\n\n${text}`,
  explainWord: (word, context) =>
    context !== undefined && context !== ''
      ? `Explain the word "${word}" as used in this context, concisely.\n\nContext: ${context}`
      : `Explain the word "${word}" concisely for a language learner.`,
};
