import type { ICatalogBackend, MediaPackage } from '@aurora/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Reusable behaviour spec for {@link ICatalogBackend} implementations (plan ·
 * 媒体市场 C3). Running the identical suite against every backend is how LSP
 * becomes verifiable: any backend that passes substitutes for the port. The
 * central invariant checked here is "上传必须自带播放全要素" — an invalid package
 * must be rejected, a valid one accepted and then browsable/fetchable.
 */
export interface CatalogContractCase {
  readonly name: string;
  /** Fresh, empty backend per test. */
  readonly makeBackend: () => ICatalogBackend;
  /** Optional teardown. */
  readonly dispose?: (backend: ICatalogBackend) => void;
}

const validPackage = (over: Partial<MediaPackage> = {}): MediaPackage => ({
  id: 'pkg-1',
  video: { uri: 'https://cdn.example/clip.mp4', durationMs: 120_000 },
  subtitles: [{ language: 'en', format: 'whisperx', hasWordTimings: true }],
  meta: { title: 'A clip', sourceLang: 'en', learningLang: 'ja', durationMs: 120_000 },
  ...over,
});

export const runCatalogContract = (testCase: CatalogContractCase): void => {
  describe(`ICatalogBackend contract: ${testCase.name}`, () => {
    let backend: ICatalogBackend;

    beforeEach(() => {
      backend = testCase.makeBackend();
    });

    afterEach(() => {
      testCase.dispose?.(backend);
    });

    it('starts empty', async () => {
      expect(await backend.list()).toEqual([]);
      expect(await backend.get('nope')).toBeUndefined();
    });

    it('accepts a valid package and makes it browsable + fetchable', async () => {
      const result = await backend.upload(validPackage());
      expect(result).toEqual({ ok: true, id: 'pkg-1' });

      const list = await backend.list();
      expect(list.map((s) => s.id)).toEqual(['pkg-1']);
      expect(list[0]).toMatchObject({ title: 'A clip', hasWordTimings: true });

      expect(await backend.get('pkg-1')).toEqual(validPackage());
    });

    it('rejects an invalid package with its validation, storing nothing', async () => {
      const bad = validPackage({ subtitles: [], meta: { title: '', sourceLang: '', learningLang: '' } });
      const result = await backend.upload(bad);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.rejected.ok).toBe(false);
        expect(result.rejected.errors.map((i) => i.requirement)).toEqual(
          expect.arrayContaining(['subtitle-track', 'title', 'source-language', 'learning-language']),
        );
      }
      expect(await backend.list()).toEqual([]);
      expect(await backend.get('pkg-1')).toBeUndefined();
    });

    it('upload overwrites an existing id', async () => {
      await backend.upload(validPackage());
      await backend.upload(validPackage({ meta: { ...validPackage().meta, title: 'Renamed' } }));
      const list = await backend.list();
      expect(list).toHaveLength(1);
      expect(list[0]?.title).toBe('Renamed');
    });
  });
};
