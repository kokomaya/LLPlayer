import { describe, expect, it } from 'vitest';
import type { MediaPackage } from '@aurora/domain';
import { createSeededCatalog } from './demo-catalog.js';

// createSeededCatalog is the local, no-HTTP ICatalogBackend the MarketScreen uses
// for demo browsing. These tests assert it honours the port contract: seeded
// packages list as summaries, get() resolves by id (undefined when absent), and
// upload() validates before accepting (so the marketplace can't ingest junk).

const PKG: MediaPackage = {
  id: 'pkg-bbb',
  video: { uri: 'https://example.test/bbb.mp4', durationMs: 600_000 },
  subtitles: [{ language: 'en', format: 'srt', hasWordTimings: false }],
  meta: { title: 'Big Buck Bunny', sourceLang: 'en', learningLang: 'ja' },
};

// Missing every playback essential — upload must reject.
const BAD_PKG = { id: 'bad', video: { uri: '' }, subtitles: [], meta: {} } as unknown as MediaPackage;

describe('createSeededCatalog', () => {
  it('lists seeded packages as summaries', async () => {
    const backend = createSeededCatalog([PKG]);
    expect(await backend.list()).toEqual([
      {
        id: 'pkg-bbb',
        title: 'Big Buck Bunny',
        sourceLang: 'en',
        learningLang: 'ja',
        durationMs: 600_000,
        hasWordTimings: false,
      },
    ]);
  });

  it('starts empty by default', async () => {
    expect(await createSeededCatalog().list()).toEqual([]);
  });

  it('gets a full package by id, or undefined when absent', async () => {
    const backend = createSeededCatalog([PKG]);
    expect(await backend.get('pkg-bbb')).toEqual(PKG);
    expect(await backend.get('missing')).toBeUndefined();
  });

  it('accepts a valid upload and makes it browsable', async () => {
    const backend = createSeededCatalog();
    const result = await backend.upload(PKG);
    expect(result).toEqual({ ok: true, id: 'pkg-bbb' });
    expect(await backend.list()).toHaveLength(1);
  });

  it('overwrites an existing id on re-upload', async () => {
    const backend = createSeededCatalog([PKG]);
    const renamed: MediaPackage = { ...PKG, meta: { ...PKG.meta, title: 'BBB v2' } };
    await backend.upload(renamed);
    expect(await backend.list()).toHaveLength(1);
    expect((await backend.get('pkg-bbb'))?.meta.title).toBe('BBB v2');
  });

  it('rejects an invalid upload with reasons, and never stores it', async () => {
    const backend = createSeededCatalog();
    const result = await backend.upload(BAD_PKG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected.errors.length).toBeGreaterThan(0);
    }
    expect(await backend.list()).toHaveLength(0);
  });
});
