/**
 * Deterministic cache-key derivation for AI results (plan/05 · ai: cache by
 * `(providerId, promptHash, input)`). A pure FNV-1a hash keeps the core free of
 * any platform crypto dependency and yields identical keys across Node / RN /
 * web, so a cached result is portable and tests are reproducible.
 */

/** 32-bit FNV-1a hash of `input`, as an 8-char lowercase hex string. */
export const stableHash = (input: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
};

/**
 * Cache key for a completion. The prompt already encodes the user input and the
 * template, so hashing it plus the provider id and capability `kind` uniquely
 * identifies a result while staying short and opaque.
 */
export const cacheKey = (
  providerId: string,
  kind: string,
  prompt: string,
): string => `${providerId}:${kind}:${stableHash(prompt)}`;
