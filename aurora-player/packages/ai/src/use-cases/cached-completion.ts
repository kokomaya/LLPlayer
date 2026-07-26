import type { CacheRepository } from '@aurora/domain';
import { cacheKey } from '../cache-key.js';
import type { ILLMProvider, LLMRequest } from '../port.js';

/**
 * Shared plumbing for the capability use-cases (plan/05 · ai). Each one builds a
 * prompt, then delegates here to check the cache and, on a miss, call the
 * provider once and store the result — so caching/dedup logic lives in one place
 * (DRY) and every capability behaves identically.
 */
export interface CompletionDeps {
  readonly provider: ILLMProvider;
  readonly cache: CacheRepository;
  /** Injected clock (epoch ms) — never `Date.now()` (plan/09 · determinism). */
  readonly now: () => number;
  /** Optional cache TTL; absent = cache forever. */
  readonly ttlMs?: number;
}

export interface Completion {
  readonly text: string;
  readonly providerId: string;
  /** `true` when served from cache (the provider was not called). */
  readonly cached: boolean;
}

export interface CachedCompletionArgs {
  readonly kind: string;
  readonly prompt: string;
  readonly system?: string;
  readonly signal?: AbortSignal;
}

/** Cache-first completion: hit → return stored text; miss → call once + store. */
export const cachedComplete = async (
  deps: CompletionDeps,
  args: CachedCompletionArgs,
): Promise<Completion> => {
  const key = cacheKey(deps.provider.id, args.kind, args.prompt);
  const hit = await deps.cache.get(key, deps.now());
  if (hit !== undefined) {
    return { text: hit, providerId: deps.provider.id, cached: true };
  }
  const req: LLMRequest = {
    prompt: args.prompt,
    ...(args.system !== undefined ? { system: args.system } : {}),
  };
  const res = await deps.provider.complete(req, args.signal);
  await deps.cache.set(key, res.text, deps.now(), deps.ttlMs);
  return { text: res.text, providerId: res.providerId, cached: false };
};
