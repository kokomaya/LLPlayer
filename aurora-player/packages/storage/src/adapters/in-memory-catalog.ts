import type {
  CatalogUploadResult,
  ICatalogBackend,
  MediaPackage,
  MediaPackageSummary,
} from '@aurora/domain';
import { summarizeMediaPackage, validateMediaPackage } from '@aurora/domain';

/**
 * In-memory {@link ICatalogBackend} — the reference implementation and the
 * default for tests/ephemeral use (and the "local + URL only" host: a real
 * network backend is injected at the composition root, DIP). No platform
 * dependency.
 *
 * Enforces the marketplace invariant "上传必须自带播放全要素": every `upload`
 * runs {@link validateMediaPackage} first and rejects an invalid package with
 * the validation report, so an incomplete package never enters the catalog.
 */
export class InMemoryCatalog implements ICatalogBackend {
  readonly #map = new Map<string, MediaPackage>();

  list(): Promise<readonly MediaPackageSummary[]> {
    return Promise.resolve(
      [...this.#map.values()].map(summarizeMediaPackage),
    );
  }

  get(id: string): Promise<MediaPackage | undefined> {
    return Promise.resolve(this.#map.get(id));
  }

  upload(pkg: MediaPackage): Promise<CatalogUploadResult> {
    const validation = validateMediaPackage(pkg);
    if (!validation.ok) {
      return Promise.resolve({ ok: false, rejected: validation });
    }
    this.#map.set(pkg.id, pkg);
    return Promise.resolve({ ok: true, id: pkg.id });
  }
}
