import {
  summarizeMediaPackage,
  validateMediaPackage,
  type CatalogUploadResult,
  type ICatalogBackend,
  type MediaPackage,
  type MediaPackageSummary,
  type MediaPackageValidation,
} from '@aurora/domain';
import type { CatalogConfig } from './catalog-config.js';

// A live HTTP {@link ICatalogBackend} for the marketplace (plan · 媒体市场 C3),
// talking to an aurora-player-server over REST. It is a drop-in substitute for
// the offline `createSeededCatalog` — same port, so the MarketScreen and
// `createMarketplaceControls` behave identically (LSP). Two device-only concerns
// live here, both pure and testable with an injected `fetch`:
//
//   1. AUTH — every route except /health is Bearer-gated, so `list`/`get`/`upload`
//      and the media/subtitle byte fetches all need the token. `authHeaders`
//      centralises it; the composition root injects the SAME token into the
//      video `source.headers` and the subtitle fetch (see App.tsx).
//   2. RE-HOST — the server bakes its OWN base URL into a package's `video.uri`
//      and `subtitles[].uri` (from AURORA_PUBLIC_BASE_URL, often `localhost`).
//      `localhost` on a phone/emulator is the DEVICE, not the dev machine, so
//      those `/media/...` URIs are re-hosted onto the base URL we actually reached
//      the catalog on. External URLs (a CDN mp4, an HLS stream) are left untouched.
//
// No credentials are ever committed — the token is injected at the root (①.E).

/** The Bearer header set every request to the catalog server carries. */
export const authHeaders = (
  token: string,
): Readonly<Record<string, string>> => ({ authorization: `Bearer ${token}` });

/**
 * Re-host a server-produced media/subtitle URI onto `baseUrl`. The server's own
 * routes live under `/media/…`; when a URI points there we swap its origin to
 * the base URL the device can actually reach (fixing a baked-in `localhost`).
 * Anything else — an external CDN video, an HLS manifest on another host — is
 * returned unchanged. Never throws: a malformed URI is passed through as-is.
 */
export const rehostMediaUri = (uri: string, baseUrl: string): string => {
  try {
    const target = new URL(uri);
    if (!target.pathname.startsWith('/media/')) return uri;
    const base = new URL(baseUrl);
    target.protocol = base.protocol;
    target.host = base.host;
    return target.toString();
  } catch {
    // Relative "/media/..." reference → join onto the base; else leave it alone.
    if (uri.startsWith('/media/')) return `${baseUrl.replace(/\/+$/, '')}${uri}`;
    return uri;
  }
};

/** Rewrite a package's video + subtitle URIs so the device can fetch them. */
const rehostPackage = (pkg: MediaPackage, baseUrl: string): MediaPackage => ({
  ...pkg,
  video: { ...pkg.video, uri: rehostMediaUri(pkg.video.uri, baseUrl) },
  subtitles: pkg.subtitles.map((t) =>
    t.uri === undefined
      ? t
      : { ...t, uri: rehostMediaUri(t.uri, baseUrl) },
  ),
});

export interface HttpCatalogDeps {
  /** Injectable fetch so the backend is Node-testable without a network. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Build a live HTTP catalog backend against `config`. `list`/`get` re-host the
 * media URIs they return; `upload` validates BEFORE the network round-trip (the
 * same gate the in-memory backend enforces — "上传必须自带播放全要素"), so an
 * invalid package never leaves the device.
 */
export const createHttpCatalogBackend = (
  config: CatalogConfig,
  deps: HttpCatalogDeps = {},
): ICatalogBackend => {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const { baseUrl, token } = config;
  const headers = authHeaders(token);
  const packagesUrl = `${baseUrl}/packages`;

  return {
    async list(): Promise<readonly MediaPackageSummary[]> {
      const res = await doFetch(packagesUrl, { headers });
      if (!res.ok) {
        throw new Error(`catalog list failed (${res.status})`);
      }
      return (await res.json()) as readonly MediaPackageSummary[];
    },

    async get(id: string): Promise<MediaPackage | undefined> {
      const res = await doFetch(
        `${packagesUrl}/${encodeURIComponent(id)}`,
        { headers },
      );
      if (res.status === 404) return undefined;
      if (!res.ok) {
        throw new Error(`catalog get '${id}' failed (${res.status})`);
      }
      const pkg = (await res.json()) as MediaPackage;
      return rehostPackage(pkg, baseUrl);
    },

    async upload(pkg: MediaPackage): Promise<CatalogUploadResult> {
      const validation = validateMediaPackage(pkg);
      if (!validation.ok) return { ok: false, rejected: validation };

      const res = await doFetch(packagesUrl, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify(pkg),
      });
      if (res.status === 422) {
        const { rejected } = (await res.json()) as {
          rejected: MediaPackageValidation;
        };
        return { ok: false, rejected };
      }
      if (!res.ok) {
        throw new Error(`catalog upload failed (${res.status})`);
      }
      const { id } = (await res.json()) as { id: string };
      return { ok: true, id };
    },
  };
};

// Re-export so the composition root can summarize locally if it ever needs to.
export { summarizeMediaPackage };
