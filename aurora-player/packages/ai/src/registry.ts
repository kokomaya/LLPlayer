import type { ILLMProvider, LLMRequest, LLMResponse } from './port.js';

/**
 * Provider selection strategy (plan/05 · ai: Offline/Online/Hybrid; "架构恢复
 * §7" provider classes):
 * - `offline` — always use the local fallback (no network, no key).
 * - `online`  — always use the injected online provider.
 * - `hybrid`  — prefer online; on error (or no online configured) fall back to
 *               offline, so the learning loop never blocks on the network.
 */
export type LLMMode = 'offline' | 'online' | 'hybrid';

export interface LLMRuntimeConfig {
  readonly mode: LLMMode;
  /** Local fallback / default. Always required so a runtime can always answer. */
  readonly offline: ILLMProvider;
  /** Network-backed provider; optional (absent = no key configured). */
  readonly online?: ILLMProvider;
}

/**
 * Compose a set of providers into a single {@link ILLMProvider} per {@link
 * LLMMode}. This is the OCP seam: use-cases depend only on `ILLMProvider`, so
 * changing the mode or adding a provider never touches them (mirrors
 * `DictionaryRegistry`). The returned runtime is itself a provider, so it slots
 * straight into the use-cases and the cache key.
 */
export const createLLMRuntime = (config: LLMRuntimeConfig): ILLMProvider => {
  const { mode, offline, online } = config;
  if (mode === 'offline') {
    return offline;
  }
  if (mode === 'online') {
    if (online === undefined) {
      throw new Error('online mode requires an online provider');
    }
    return online;
  }
  // hybrid
  return new HybridProvider(offline, online);
};

/** Online-first provider that degrades to offline on failure (plan/05 · ai). */
class HybridProvider implements ILLMProvider {
  readonly id: string;

  constructor(
    private readonly offline: ILLMProvider,
    private readonly online: ILLMProvider | undefined,
  ) {
    this.id = online !== undefined ? 'hybrid' : offline.id;
  }

  async complete(req: LLMRequest, signal?: AbortSignal): Promise<LLMResponse> {
    if (this.online === undefined) {
      return this.offline.complete(req, signal);
    }
    try {
      return await this.online.complete(req, signal);
    } catch {
      return this.offline.complete(req, signal);
    }
  }
}
