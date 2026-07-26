import type { VocabularyRepository } from '@aurora/domain';
import {
  MediaImporterPlugin,
  PluginRegistry,
  type ImportedMedia,
  type Plugin,
  type PluginContext,
} from '@aurora/plugins';
import { describe, expect, it } from 'vitest';
import { runPlugins, type PluginsDeps } from './plugins.js';
import type { CliIO } from './run.js';

/**
 * Composition-root test for the build-profile capability gate (plan/12; rule
 * ①.F.20): a store-policy-violating plugin (YouTube-shaped: `storeSafe:false`,
 * desktop/sideload only) must be excluded from the Play build and available on
 * desktop — proven through the CLI `--profile` surface, fully offline.
 */
const MANIFEST = JSON.stringify({
  mediaId: 'movie.mkv',
  subtitles: [
    { filename: 'en.srt', content: '1\n00:00:00,000 --> 00:00:02,000\nhi\n' },
  ],
});

/** A non-store-safe media importer, gated out of Play but fine on desktop. */
class FakeYouTubePlugin implements Plugin {
  readonly id = 'youtube-importer';
  readonly version = '1.0.0';
  readonly capabilities = ['media-importer'] as const;
  readonly distribution = {
    storeSafe: false,
    platforms: ['desktop', 'sideload'],
  } as const;
  activate(ctx: PluginContext): void {
    ctx.registerMediaImporter({
      id: 'youtube',
      canImport: (ref) => ref.uri.endsWith('.yt'),
      import: (): Promise<ImportedMedia> =>
        Promise.resolve({ mediaId: 'yt-video', subtitleTracks: [] }),
    });
  }
}

const fakeVocab = (): VocabularyRepository => ({
  upsert: () => Promise.resolve(),
  get: () => Promise.resolve(undefined),
  list: () => Promise.resolve([]),
  delete: () => Promise.resolve(),
});

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

const files: Record<string, string> = {
  'movie.json': MANIFEST,
  'clip.yt': 'ignored — importer fetches by uri',
};

/** Fresh registry per call so activation state never leaks between cases. */
const invoke = async (argv: string[]): Promise<Captured> => {
  const registry = new PluginRegistry()
    .register(new FakeYouTubePlugin())
    .register(new MediaImporterPlugin());
  const deps: PluginsDeps = { registry, vocab: fakeVocab() };
  let out = '';
  let err = '';
  const io: CliIO = {
    readFile: (path) => {
      const f = files[path];
      if (f === undefined) {
        throw new Error('no such file');
      }
      return f;
    },
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  const code = await runPlugins(argv, io, deps);
  return { out, err, code };
};

describe('aurora plugin build-profile gate', () => {
  it('excludes the YouTube importer from the Play profile in `list`', async () => {
    const r = await invoke(['plugins', 'list', '--profile', 'play']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('youtube-importer v1.0.0 [media-importer] excluded (play):');
    // A no-meta plugin is unaffected under Play.
    expect(r.out).toContain('manifest-importer v1.0.0 [media-importer] active');
  });

  it('keeps the YouTube importer active under the desktop profile', async () => {
    const r = await invoke(['plugins', 'list', '--profile', 'desktop']);
    expect(r.out).toContain('youtube-importer v1.0.0 [media-importer] active');
  });

  it('makes the gated capability unavailable under Play (import fails)', async () => {
    const r = await invoke(['import', 'clip.yt', '--profile', 'play']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no media importer');
  });

  it('makes the gated capability usable under desktop', async () => {
    const r = await invoke(['import', 'clip.yt', '--profile', 'desktop']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('media: yt-video');
  });

  it('defaults to the desktop profile when --profile is omitted', async () => {
    const r = await invoke(['plugins', 'list']);
    expect(r.out).toContain('youtube-importer v1.0.0 [media-importer] active');
  });

  it('still imports a no-meta manifest importer under the Play profile', async () => {
    const r = await invoke(['import', 'movie.json', '--profile', 'play']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('media: movie.mkv');
  });

  it('rejects an unknown --profile value with exit code 2', async () => {
    const r = await invoke(['plugins', 'list', '--profile', 'bogus']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--profile must be one of');
  });
});
