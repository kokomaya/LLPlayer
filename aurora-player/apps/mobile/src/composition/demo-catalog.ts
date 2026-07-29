// A seedable, in-memory {@link ICatalogBackend} for the marketplace screen when
// no real HTTP backend is configured (Epic C · 本地 demo 后端). It honours the
// SAME port contract the device would talk to — `list()` returns summaries,
// `get()` returns the full package or undefined, `upload()` validates before
// accepting — so `createMarketplaceControls` and the MarketScreen behave exactly
// as they would against a live catalog. Pure: only `@aurora/domain` value logic,
// no platform imports and no clock, so it is fully Node-testable and can be swap-
// replaced by `HttpCatalogBackend` at the composition root without UI changes.

import {
  summarizeMediaPackage,
  validateMediaPackage,
  type CatalogUploadResult,
  type ICatalogBackend,
  type MediaPackage,
} from '@aurora/domain';

/**
 * Build an in-memory catalog backend pre-populated with `seed` packages. Later
 * `upload()`s validate through {@link validateMediaPackage} and overwrite by id,
 * mirroring `InMemoryCatalog`/`HttpCatalogBackend` semantics so the marketplace
 * UI is indistinguishable from a real backend during local/demo use.
 */
export const createSeededCatalog = (
  seed: readonly MediaPackage[] = [],
): ICatalogBackend => {
  const store = new Map<string, MediaPackage>(seed.map((p) => [p.id, p]));
  return {
    list: () => Promise.resolve([...store.values()].map(summarizeMediaPackage)),
    get: (id) => Promise.resolve(store.get(id)),
    upload: (pkg): Promise<CatalogUploadResult> => {
      const validation = validateMediaPackage(pkg);
      if (!validation.ok) {
        return Promise.resolve({ ok: false, rejected: validation });
      }
      store.set(pkg.id, pkg);
      return Promise.resolve({ ok: true, id: pkg.id });
    },
  };
};
