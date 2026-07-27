/**
 * REFERENCE ONLY — excluded from the CI build/test/lint graph (`*.example.ts`).
 *
 * A real HTTP {@link ICatalogBackend} sketch over a marketplace REST service. It
 * needs network access and credentials, so it is NOT part of the pure, hermetic
 * core that CI unit-tests — it is validated off-CI against a live endpoint. Its
 * only job is to satisfy the SAME `ICatalogBackend` port and pass
 * `runCatalogContract`, proving a network backend is a drop-in substitute for
 * the in-memory one (LSP).
 *
 * SECURITY (repo rule ①.E): never hard-code or commit a token/credential. Read
 * it from an environment variable / untracked file at the composition root and
 * inject it here. This file contains only a placeholder env lookup. It also
 * MUST validate uploads with `validateMediaPackage` before hitting the network,
 * so "上传必须自带播放全要素" holds for the real backend too.
 *
 * To activate off-CI: drop the `.example` segment, provide `AURORA_CATALOG_URL`
 * and `AURORA_CATALOG_TOKEN` at the composition root, and inject an instance.
 */
import type {
  CatalogUploadResult,
  ICatalogBackend,
  MediaPackage,
  MediaPackageSummary,
} from '@aurora/domain';
import { validateMediaPackage } from '@aurora/domain';

export interface HttpCatalogConfig {
  /** Base URL of the marketplace API, e.g. `https://market.example/api`. */
  readonly baseUrl: string;
  /** Bearer token, injected at the composition root — never committed. */
  readonly token: string;
  /** Injectable fetch so it stays testable off-CI. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Read config from the environment WITHOUT committing secrets. Returns
 * `undefined` when unset so the host can fall back to local/URL-only mode.
 */
export const httpCatalogConfigFromEnv = (
  env: Record<string, string | undefined> = process.env,
): HttpCatalogConfig | undefined => {
  const baseUrl = env['AURORA_CATALOG_URL'];
  const token = env['AURORA_CATALOG_TOKEN'];
  if (baseUrl === undefined || token === undefined) return undefined;
  return { baseUrl, token };
};

export class HttpCatalogBackend implements ICatalogBackend {
  readonly #fetch: typeof globalThis.fetch;

  constructor(private readonly config: HttpCatalogConfig) {
    this.#fetch = config.fetch ?? globalThis.fetch;
  }

  async list(): Promise<readonly MediaPackageSummary[]> {
    const res = await this.#fetch(`${this.config.baseUrl}/packages`, {
      headers: this.#headers(),
    });
    return (await res.json()) as readonly MediaPackageSummary[];
  }

  async get(id: string): Promise<MediaPackage | undefined> {
    const res = await this.#fetch(
      `${this.config.baseUrl}/packages/${encodeURIComponent(id)}`,
      { headers: this.#headers() },
    );
    if (res.status === 404) return undefined;
    return (await res.json()) as MediaPackage;
  }

  async upload(pkg: MediaPackage): Promise<CatalogUploadResult> {
    // Validate BEFORE the network round-trip — the same gate the in-memory
    // backend enforces (rule: 上传必须自带播放全要素).
    const validation = validateMediaPackage(pkg);
    if (!validation.ok) return { ok: false, rejected: validation };

    const res = await this.#fetch(`${this.config.baseUrl}/packages`, {
      method: 'POST',
      headers: { ...this.#headers(), 'content-type': 'application/json' },
      body: JSON.stringify(pkg),
    });
    const { id } = (await res.json()) as { id: string };
    return { ok: true, id };
  }

  #headers(): Record<string, string> {
    return { authorization: `Bearer ${this.config.token}` };
  }
}
