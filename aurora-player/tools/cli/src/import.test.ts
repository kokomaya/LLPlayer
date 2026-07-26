import type { VocabularyRepository } from '@aurora/domain';
import { MediaImporterPlugin, PluginRegistry } from '@aurora/plugins';
import { beforeEach, describe, expect, it } from 'vitest';
import { runPlugins, type PluginsDeps } from './plugins.js';
import type { CliIO } from './run.js';

/**
 * Composition-root integration test for the media-import slice (plan/07 · M5
 * DoD): wire the registry + manifest importer through their ports and drive
 * `import` via the CLI surface. Fully offline and deterministic — the manifest
 * (with inline SRT cues) is injected through a fake `readFile`; no filesystem,
 * network, model, or clock.
 */
const MANIFEST = JSON.stringify({
  mediaId: 'movie.mkv',
  title: 'Test Movie',
  durationMs: 35000,
  subtitles: [
    {
      filename: 'en.srt',
      content:
        '1\n00:00:00,000 --> 00:00:02,000\nhello there\n\n' +
        '2\n00:00:02,000 --> 00:00:04,000\nthis is aurora\n',
    },
  ],
});

/** Read-only vocab repo — unused by `import`, present only to satisfy deps. */
const fakeVocab = (): VocabularyRepository => ({
  upsert: () => Promise.resolve(),
  get: () => Promise.resolve(undefined),
  list: () => Promise.resolve([]),
  delete: () => Promise.resolve(),
  clear: () => Promise.resolve(),
});

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

describe('aurora import command', () => {
  let deps: PluginsDeps;
  let written: { path: string; data: string } | undefined;
  const files: Record<string, string> = { 'movie.json': MANIFEST };

  beforeEach(() => {
    written = undefined;
    const registry = new PluginRegistry().register(new MediaImporterPlugin());
    deps = {
      registry,
      vocab: fakeVocab(),
      writeFile: (path, data) => {
        written = { path, data };
      },
    };
  });

  const invoke = async (argv: string[]): Promise<Captured> => {
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

  it('routes `import` as a plugin command', async () => {
    const r = await invoke(['import', 'movie.json']);
    expect(r.code).toBe(0);
  });

  it('imports media metadata + subtitle tracks to stdout', async () => {
    const r = await invoke(['import', 'movie.json']);
    expect(r.out).toContain('media: movie.mkv');
    expect(r.out).toContain('title: Test Movie');
    expect(r.out).toContain('duration: 35000ms');
    expect(r.out).toContain('tracks: 1');
    expect(r.out).toContain('[0] srt 2 line(s) words:no');
  });

  it('lists the manifest importer capability via `plugins list`', async () => {
    const r = await invoke(['plugins', 'list']);
    expect(r.out).toContain('manifest-importer v1.0.0 [media-importer] active');
  });

  it('writes an import summary to a file when --out is given', async () => {
    const r = await invoke(['import', 'movie.json', '--out', 'media.txt']);
    expect(r.code).toBe(0);
    expect(written?.path).toBe('media.txt');
    expect(written?.data).toContain('media: movie.mkv');
    expect(r.out).toContain('wrote import summary to media.txt');
  });

  it('reports a missing manifest file with exit code 1', async () => {
    const r = await invoke(['import', 'nope.json']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('cannot read');
  });

  it('rejects a ref no importer can handle with exit code 1', async () => {
    files['clip.mp4'] = 'binary';
    const r = await invoke(['import', 'clip.mp4']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no media importer');
  });

  it('reports a malformed manifest with exit code 1', async () => {
    files['bad.json'] = '{ not json';
    const r = await invoke(['import', 'bad.json']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('import failed');
  });

  it('requires a <manifest.json> argument (exit code 2)', async () => {
    const r = await invoke(['import']);
    expect(r.code).toBe(2);
  });
});
