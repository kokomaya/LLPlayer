/**
 * The LLM provider seam (plan/04 · `ILLMProvider`; plan/05 · ai). This is the
 * OCP/DIP boundary for AI: a new backend (OpenAI-compatible, Claude, a local
 * Ollama, or an offline stub) is a new implementation of this one port — no
 * use-case or core code changes when you swap it (plan/05 · "切换 Provider 不改
 * 用例").
 */

/** A single completion request. Kept minimal (ISP); richer knobs are optional. */
export interface LLMRequest {
  readonly prompt: string;
  /** Optional system / role instruction. */
  readonly system?: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
}

/** A completion result. `providerId` is stamped by the answering provider. */
export interface LLMResponse {
  readonly text: string;
  /** {@link ILLMProvider.id} of the provider that produced this text. */
  readonly providerId: string;
}

export interface ILLMProvider {
  readonly id: string;
  /**
   * Produce a completion for `req`. `signal` (when given) lets the caller abort
   * an in-flight online call; offline providers may ignore it. Returns a
   * {@link LLMResponse}; throws only on a genuine backend failure (network,
   * auth) — which the hybrid runtime turns into an offline fallback.
   */
  complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse>;
}
