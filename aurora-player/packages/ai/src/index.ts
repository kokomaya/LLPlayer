// ai-core: an LLM provider port, an offline/online/hybrid runtime (OCP), a
// bundled offline provider, and the translate/explain capability use-cases with
// result caching. Online/API providers live behind `.example.ts` — they need
// network + keys and stay out of the pure core (plan/05 · ai). Depends only on
// the kernel (@aurora/domain); the cache is consumed through its kernel port.

export type { ILLMProvider, LLMRequest, LLMResponse } from './port.js';
export { DEFAULT_PROMPTS, type PromptConfig } from './prompts.js';
export { stableHash, cacheKey } from './cache-key.js';
export { createLLMRuntime, type LLMMode, type LLMRuntimeConfig } from './registry.js';
export {
  StaticLLMProvider,
  type StaticLLMOptions,
} from './providers/static-llm-provider.js';

export {
  cachedComplete,
  type CompletionDeps,
  type Completion,
} from './use-cases/cached-completion.js';
export {
  translateLine,
  type TranslateDeps,
  type TranslateInput,
  type TranslationResult,
} from './use-cases/translate-line.js';
export {
  explainGrammar,
  type ExplainGrammarDeps,
  type ExplainGrammarInput,
  type GrammarExplanation,
} from './use-cases/explain-grammar.js';
export {
  explainWord,
  type ExplainWordDeps,
  type ExplainWordInput,
  type WordExplanation,
} from './use-cases/explain-word.js';
