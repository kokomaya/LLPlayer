import type { ILLMProvider, LLMRequest, LLMResponse } from '../port.js';

export interface StaticLLMOptions {
  /** Provider id; defaults to `"offline"`. */
  readonly id?: string;
  /** Exact-prompt → canned completion, for deterministic fixtures. */
  readonly responses?: Readonly<Record<string, string>>;
  /** Deterministic fallback when no canned response matches. */
  readonly fallback?: (req: LLMRequest) => string;
}

/**
 * Offline {@link ILLMProvider} (plan/05 · ai "离线兜底"). Fully deterministic and
 * dependency-free: it either returns a canned response for an exact prompt or a
 * pure, prompt-derived fallback. This is the default so the CLI and hybrid mode
 * work with no network and no API key, and it is the provider the reusable
 * contract runs against to prove any provider is substitutable (LSP).
 */
export class StaticLLMProvider implements ILLMProvider {
  readonly id: string;
  readonly #responses: Readonly<Record<string, string>>;
  readonly #fallback: (req: LLMRequest) => string;

  constructor(opts: StaticLLMOptions = {}) {
    this.id = opts.id ?? 'offline';
    this.#responses = opts.responses ?? {};
    this.#fallback = opts.fallback ?? ((req) => `[offline] ${req.prompt}`);
  }

  complete(req: LLMRequest): Promise<LLMResponse> {
    const text = this.#responses[req.prompt] ?? this.#fallback(req);
    return Promise.resolve({ text, providerId: this.id });
  }
}
