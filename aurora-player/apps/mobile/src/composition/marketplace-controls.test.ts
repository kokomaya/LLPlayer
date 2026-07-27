import { describe, expect, it } from 'vitest';
import {
  emptyConsent,
  summarizeMediaPackage,
  validateMediaPackage,
  withConsent,
  type CatalogUploadResult,
  type ConsentState,
  type ICatalogBackend,
  type MediaPackage,
} from '@aurora/domain';
import { createMarketplaceControls } from './marketplace-controls.js';

// The marketplace controller is the headless brain of Epic C's browse/detail/
// upload screen. It talks to the catalog only through ICatalogBackend, so a
// Map-backed fake (that still honours the port's "validate before accept" rule)
// exercises the whole flow in Node — no HTTP, no device.

const AT = 1_700_000_000_000;
const withNetwork = (): ConsentState => withConsent(emptyConsent(), 'network', true, AT);

const REMOTE_PKG: MediaPackage = {
  id: 'pkg-remote',
  video: { uri: 'https://cdn.example/sintel.mp4', durationMs: 888_000 },
  subtitles: [{ language: 'en', format: 'srt', hasWordTimings: true }],
  meta: { title: 'Sintel', sourceLang: 'en', learningLang: 'ja' },
};

// Missing every playback essential — the backend must reject this on upload.
const EMPTY_PKG = { id: 'bad', video: { uri: '' }, subtitles: [], meta: {} } as unknown as MediaPackage;

/** In-memory backend that validates on upload, per the ICatalogBackend contract. */
const makeCatalog = (seed: readonly MediaPackage[] = []): ICatalogBackend => {
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

describe('createMarketplaceControls', () => {
  it('browses the catalog as summaries', async () => {
    const controls = createMarketplaceControls(makeCatalog([REMOTE_PKG]));
    const listing = await controls.browse();
    expect(listing).toEqual([
      {
        id: 'pkg-remote',
        title: 'Sintel',
        sourceLang: 'en',
        learningLang: 'ja',
        durationMs: 888_000,
        hasWordTimings: true,
      },
    ]);
  });

  it('opens a package for the detail view, or null when absent', async () => {
    const controls = createMarketplaceControls(makeCatalog([REMOTE_PKG]));
    expect(await controls.openPackage('pkg-remote')).toEqual(REMOTE_PKG);
    expect(await controls.openPackage('nope')).toBeNull();
  });

  it('reports notFound when playing a vanished id', async () => {
    const controls = createMarketplaceControls(makeCatalog());
    expect(await controls.playPackage('gone', withNetwork())).toEqual({ found: false });
  });

  it('gates play on network consent, then clears it once granted', async () => {
    const controls = createMarketplaceControls(makeCatalog([REMOTE_PKG]));

    const blocked = await controls.playPackage('pkg-remote', emptyConsent());
    expect(blocked).toEqual({ found: true, ready: false, missing: ['network'] });

    const ready = await controls.playPackage('pkg-remote', withNetwork());
    expect(ready.found).toBe(true);
    if (ready.found && ready.ready) {
      expect(ready.media.uri).toBe('https://cdn.example/sintel.mp4');
    }
  });

  it('accepts a valid upload and makes it browsable', async () => {
    const controls = createMarketplaceControls(makeCatalog());
    const result = await controls.publish(REMOTE_PKG);
    expect(result).toEqual({ ok: true, id: 'pkg-remote' });
    expect(await controls.browse()).toHaveLength(1);
  });

  it('rejects an upload missing playback essentials, with reasons for the UI', async () => {
    const controls = createMarketplaceControls(makeCatalog());
    const result = await controls.publish(EMPTY_PKG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.errors.length).toBeGreaterThan(0);
    }
    // A rejected upload never enters the catalog.
    expect(await controls.browse()).toHaveLength(0);
  });
});
