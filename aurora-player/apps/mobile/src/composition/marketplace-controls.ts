import type {
  CatalogUploadResult,
  ConsentState,
  ICatalogBackend,
  MediaPackage,
  MediaPackageSummary,
} from '@aurora/domain';
import { decidePlayback, type PlaybackDecision } from './source-gate.js';

// Headless brain for Epic C's marketplace screen (plan · 媒体市场 C3), so the
// device UI stays a thin list/detail/button layer (plan/05 — no logic in
// `*.tsx`). It reaches the catalog ONLY through the {@link ICatalogBackend} port
// (a real HTTP backend on device, a fake in tests — DIP), and routes "play this
// item" through the shared source-selection consent gate:
//   • browse()        — the listing view (summaries only, cheap to page).
//   • openPackage(id) — the detail view (full package, or null if it vanished).
//   • playPackage(id) — detail → play, gated by `network` consent.
//   • publish(pkg)    — upload; the backend validates, so a rejection returns as
//                       data the UI renders as a "missing requirements" list.
// No platform imports and no clock, so the whole flow is Node-testable.

/**
 * A resolved "play this catalog item" decision, or `notFound` when the id no
 * longer exists (e.g. unpublished between browsing the list and tapping it).
 */
export type PackagePlayback =
  | { readonly found: false }
  | ({ readonly found: true } & PlaybackDecision);

/** The marketplace actions a browse/detail screen offers. */
export interface MarketplaceControls {
  /** List catalog entries for the browse view (summaries only). */
  browse(): Promise<readonly MediaPackageSummary[]>;
  /** Fetch the full package for a detail view, or `null` if it is gone. */
  openPackage(id: string): Promise<MediaPackage | null>;
  /**
   * Resolve a catalog item into a playback decision, applying the `network`
   * consent gate. Reports `found:false` if the id is gone, `ready:false` with the
   * missing consent if network access is not yet granted.
   */
  playPackage(id: string, consent: ConsentState): Promise<PackagePlayback>;
  /** Publish a package; the backend validates and may reject with reasons. */
  publish(pkg: MediaPackage): Promise<CatalogUploadResult>;
}

/**
 * Build {@link MarketplaceControls} over a catalog `backend`. All decisions live
 * here; the UI just calls these and renders the results.
 */
export const createMarketplaceControls = (
  backend: ICatalogBackend,
): MarketplaceControls => ({
  browse: () => backend.list(),
  openPackage: async (id) => (await backend.get(id)) ?? null,
  playPackage: async (id, consent) => {
    const pkg = await backend.get(id);
    if (pkg === undefined) {
      return { found: false };
    }
    return { found: true, ...decidePlayback({ kind: 'package', pkg }, consent) };
  },
  publish: (pkg) => backend.upload(pkg),
});
