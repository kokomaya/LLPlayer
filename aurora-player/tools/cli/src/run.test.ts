import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { run, type CliIO } from './run.js';

const SAMPLE = fileURLToPath(
  new URL('../../../samples/subtitles/basic.srt', import.meta.url),
);
const WHISPERX = fileURLToPath(
  new URL('../../../samples/subtitles/basic.whisperx.json', import.meta.url),
);

interface Captured {
  out: string;
  err: string;
  code: number;
}

const invoke = (argv: string[], files: Record<string, string> = {}): Captured => {
  let out = '';
  let err = '';
  const io: CliIO = {
    readFile: (path) => {
      if (path in files) {
        return files[path]!;
      }
      return readFileSync(path, 'utf8');
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

describe('aurora subs show', () => {
  it('prints the active subtitle at a time inside a cue', () => {
    const r = invoke(['subs', 'show', SAMPLE, '--at', '22000']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[showing]');
    expect(r.out).toContain("3. I'm fine");
  });

  it('accepts --at=<ms> form', () => {
    const r = invoke(['subs', 'show', SAMPLE, '--at=1000']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('1. Hello World!');
  });

  it('reports the gap state with prev/next when nothing is showing', () => {
    const r = invoke(['subs', 'show', SAMPLE, '--at', '18000']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[around]');
    expect(r.out).toContain('no subtitle showing');
    expect(r.out).toContain('next:');
  });

  it('errors on a missing file argument', () => {
    const r = invoke(['subs', 'show', '--at', '1000']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('missing <file>');
  });

  it('errors when --at is absent or not a number', () => {
    expect(invoke(['subs', 'show', SAMPLE]).code).toBe(2);
    expect(invoke(['subs', 'show', SAMPLE, '--at', 'abc']).code).toBe(2);
  });

  it('errors when the file cannot be read', () => {
    const r = invoke(['subs', 'show', 'D:/does/not/exist.srt', '--at', '0']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('cannot read');
  });

  it('errors when no parser matches the content', () => {
    const r = invoke(['subs', 'show', 'mystery.xyz', '--at', '0'], {
      'mystery.xyz': 'not a subtitle',
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain('error:');
  });

  it('prints usage for an unknown command', () => {
    const r = invoke(['nope']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('Usage:');
  });
});

describe('aurora subs words', () => {
  it('prints the active line and real word for a word-timed file', () => {
    const r = invoke(['subs', 'words', WHISPERX, '--at', '20500']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[word-timed]');
    expect(r.out).toContain("3. I'm fine");
    expect(r.out).toContain("word: I'm");
    expect(r.out).not.toContain('estimated');
  });

  it('flags an estimated word for a sentence-only file', () => {
    const r = invoke(['subs', 'words', SAMPLE, '--at', '3000']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[sentence-only]');
    expect(r.out).toContain('(estimated)');
  });

  it('errors on missing <file> and missing --at', () => {
    expect(invoke(['subs', 'words', '--at', '1000']).code).toBe(2);
    expect(invoke(['subs', 'words', SAMPLE]).code).toBe(2);
  });
});

describe('aurora play', () => {
  it('prints a frame per tick, ending at the duration', () => {
    const r = invoke(['play', 'movie.mkv', '--subs', WHISPERX, '--step', '5000']);
    expect(r.code).toBe(0);
    const lines = r.out.trimEnd().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.at(-1)).toContain('@ 35000ms');
  });

  it('marks estimated words with ~ for a sentence-only file', () => {
    const r = invoke(['play', 'movie.mkv', '--subs', SAMPLE, '--step', '5000']);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/word: \S+~/);
  });

  it('requires --subs and rejects a bad --speed/--step', () => {
    expect(invoke(['play', 'movie.mkv']).code).toBe(2);
    expect(
      invoke(['play', 'movie.mkv', '--subs', SAMPLE, '--speed', '0']).code,
    ).toBe(2);
    expect(
      invoke(['play', 'movie.mkv', '--subs', SAMPLE, '--step', 'abc']).code,
    ).toBe(2);
  });

  it('errors on a missing <file> argument', () => {
    const r = invoke(['play', '--subs', SAMPLE]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('missing <file>');
  });
});
