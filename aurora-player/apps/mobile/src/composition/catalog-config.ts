// Resolve the marketplace backend's connection config (plan · 媒体市场 C3 · 本地
// 调试接入). The debug build talks to a LOCAL aurora-player-server; the release
// build talks to the deployed one. Which one — and whether a live HTTP backend
// is used at all vs. the offline demo catalog — is decided here from plain
// inputs, so the choice is Node-testable and the device shell (App.tsx) only has
// to supply `__DEV__` + the URLs. No platform imports, no I/O.

/** A validated, ready-to-use catalog server connection. */
export interface CatalogConfig {
  /** Base URL of the server, no trailing slash (e.g. `http://10.0.2.2:8787`). */
  readonly baseUrl: string;
  /** Bearer token the server requires on every non-health route. */
  readonly token: string;
}

/** Raw, possibly-missing inputs from the device shell (env / app config). */
export interface CatalogConfigInput {
  /**
   * Whether to use a live HTTP backend at all. Typically `__DEV__` for the debug
   * build (→ local server) or a "release URL is configured" flag. When false,
   * the host falls back to the offline demo catalog.
   */
  readonly enabled: boolean;
  /** Server base URL; leading/trailing whitespace and trailing `/` are trimmed. */
  readonly baseUrl?: string | undefined;
  /** Bearer token; surrounding whitespace is trimmed. */
  readonly token?: string | undefined;
}

const trimTrailingSlashes = (s: string): string => s.replace(/\/+$/, '');

/**
 * Turn raw inputs into a {@link CatalogConfig}, or `null` when a live backend
 * should NOT be used (disabled, or missing/blank URL or token). Returning `null`
 * — rather than a half-built config — lets the host cleanly fall back to the
 * offline demo catalog instead of pointing the app at an unusable endpoint.
 *
 * Only `http`/`https` URLs are accepted; anything else (a typo, a `file://`,
 * an empty string) resolves to `null`.
 */
export const resolveCatalogConfig = (
  input: CatalogConfigInput,
): CatalogConfig | null => {
  if (!input.enabled) return null;

  const baseUrl = trimTrailingSlashes((input.baseUrl ?? '').trim());
  const token = (input.token ?? '').trim();
  if (baseUrl === '' || token === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  return { baseUrl, token };
};
