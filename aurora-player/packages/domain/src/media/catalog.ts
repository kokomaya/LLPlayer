import type {
  MediaPackage,
  MediaPackageSummary,
  MediaPackageValidation,
} from './package.js';

/**
 * The outcome of an upload attempt: either the catalog accepted the package and
 * assigned/kept an `id`, or it rejected it and returns the {@link
 * MediaPackageValidation} that explains what was missing. Rejection is a normal,
 * typed result — not a thrown error — so a UI can list the missing requirements.
 */
export type CatalogUploadResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly rejected: MediaPackageValidation };

/**
 * The media marketplace backend port (plan · 媒体市场 C3). The core depends only
 * on this abstraction; concrete backends (an in-memory fake for tests, a real
 * HTTP service behind credentials) implement it at the composition root (DIP).
 *
 * An empty/absent implementation is a valid degenerate case — "local + URL play
 * only, no marketplace" (ISP: a host that never offers browsing/upload simply
 * has no backend). Every implementation MUST validate with `validateMediaPackage`
 * before accepting an upload, so "上传必须自带播放全要素" holds regardless of backend.
 */
export interface ICatalogBackend {
  /** Browse listings (summaries only — cheap to page over). */
  list(): Promise<readonly MediaPackageSummary[]>;
  /** Fetch one full package by id, or `undefined` if absent. */
  get(id: string): Promise<MediaPackage | undefined>;
  /** Publish a package after validating it; rejects invalid packages. */
  upload(pkg: MediaPackage): Promise<CatalogUploadResult>;
}
