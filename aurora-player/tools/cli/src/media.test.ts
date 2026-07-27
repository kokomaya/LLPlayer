import type { MediaPackage } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import { isMediaCommand } from './media.js';
import { run, type CliIO } from './run.js';

/**
 * The `media validate` command is the CLI echo of the marketplace upload gate
 * (plan · 媒体市场 C): it must accept a self-contained package, reject one that
 * cannot be played/studied while listing exactly what is missing, and surface
 * degradations as non-blocking warnings. All I/O is faked — no fs, no network.
 */
interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

const validPackage: MediaPackage = {
  id: 'pkg-1',
  video: { uri: 'https://cdn.example/sintel.mp4', durationMs: 888_000 },
  subtitles: [{ language: 'en', format: 'srt', hasWordTimings: true }],
  meta: { title: 'Sintel', sourceLang: 'en', learningLang: 'ja' },
};

const invoke = (argv: string[], files: Record<string, string>): Captured => {
  let out = '';
  let err = '';
  const io: CliIO = {
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error('ENOENT');
      return content;
    },
    write: (t) => {
      out += t;
    },
    writeError: (t) => {
      err += t;
    },
  };
  const code = run(argv, io);
  return { out, err, code };
};

describe('aurora media validate', () => {
  it('routes `media` as a media command', () => {
    expect(isMediaCommand('media')).toBe(true);
    expect(isMediaCommand('play')).toBe(false);
    expect(isMediaCommand(undefined)).toBe(false);
  });

  it('accepts a self-contained package (exit 0)', () => {
    const r = invoke(['media', 'validate', 'p.json'], {
      'p.json': JSON.stringify(validPackage),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('valid: pkg-1');
    expect(r.out).toContain('Sintel');
    expect(r.out).not.toContain('warnings');
  });

  it('reports non-blocking warnings but still passes', () => {
    const degraded: MediaPackage = {
      id: 'pkg-2',
      video: { uri: 'file:///v.mp4' }, // no duration
      subtitles: [{ hasWordTimings: false }], // no word timings
      meta: { title: 'T', sourceLang: 'en', learningLang: 'ja' },
    };
    const r = invoke(['media', 'validate', 'p.json'], {
      'p.json': JSON.stringify(degraded),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain('valid: pkg-2');
    expect(r.out).toContain('warnings');
    expect(r.out).toContain('word-timings');
    expect(r.out).toContain('duration');
  });

  it('rejects a package missing playback essentials, listing each (exit 1)', () => {
    const r = invoke(['media', 'validate', 'p.json'], {
      'p.json': JSON.stringify({ id: 'x', video: {}, subtitles: [], meta: {} }),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain('invalid:');
    expect(r.out).toContain('video-source');
    expect(r.out).toContain('subtitle-track');
    expect(r.out).toContain('title');
    expect(r.out).toContain('source-language');
    expect(r.out).toContain('learning-language');
  });

  it('tolerates a hostile/partial shape without crashing (exit 1)', () => {
    const r = invoke(['media', 'validate', 'p.json'], { 'p.json': '{}' });
    expect(r.code).toBe(1);
    expect(r.out).toContain('invalid:');
  });

  it('errors on missing argument (exit 2)', () => {
    const r = invoke(['media', 'validate'], {});
    expect(r.code).toBe(2);
    expect(r.err).toContain('missing <package.json>');
  });

  it('errors on an unreadable file (exit 1)', () => {
    const r = invoke(['media', 'validate', 'nope.json'], {});
    expect(r.code).toBe(1);
    expect(r.err).toContain('cannot read');
  });

  it('errors on malformed JSON (exit 1)', () => {
    const r = invoke(['media', 'validate', 'p.json'], { 'p.json': 'not json' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('not valid JSON');
  });

  it('errors on an unknown media subcommand (exit 2)', () => {
    const r = invoke(['media', 'frobnicate'], {});
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown media subcommand');
  });
});
