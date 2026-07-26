import {
  languageCode,
  normalizeLemma,
  type VocabEntry,
  type VocabularyRepository,
} from '@aurora/domain';
import {
  AnkiExporterPlugin,
  PluginRegistry,
  WhisperPlugin,
  type Plugin,
} from '@aurora/plugins';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CliIO } from './run.js';
import { isPluginsCommand, runPlugins, type PluginsDeps } from './plugins.js';

/**
 * Composition-root integration test for the plugins slice (plan/07 · M5 DoD):
 * wire the registry + a vocab repo through their ports and drive
 * list/transcribe/export via the CLI surface. Fully offline and deterministic —
 * no model, no network, no clock.
 */
const en = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();

const entry = (id: string, word: string, context: string): VocabEntry => ({
  id,
  lemma: normalizeLemma(word),
  lang: en,
  status: 'learning',
  createdAt: 0,
  context,
});

/** Minimal read-only vocab repo — only `list` is exercised by `export anki`. */
const fakeVocab = (entries: readonly VocabEntry[]): VocabularyRepository => ({
  upsert: () => Promise.resolve(),
  get: () => Promise.resolve(undefined),
  list: () => Promise.resolve(entries),
  delete: () => Promise.resolve(),
  clear: () => Promise.resolve(),
});

class BrokenPlugin implements Plugin {
  readonly id = 'broken';
  readonly version = '0.0.1';
  readonly capabilities = ['exporter'] as const;
  activate(): void {
    throw new Error('boom');
  }
}

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

describe('aurora plugin commands', () => {
  let deps: PluginsDeps;
  let written: { path: string; data: string } | undefined;

  const makeDeps = (extra: readonly Plugin[] = []): PluginsDeps => {
    const registry = new PluginRegistry();
    for (const p of extra) {
      registry.register(p);
    }
    registry.register(new WhisperPlugin()).register(new AnkiExporterPlugin());
    return {
      registry,
      vocab: fakeVocab([
        entry('v2', 'fine', 'I am fine'),
        entry('v1', 'hello', 'hello there'),
      ]),
      writeFile: (path, data) => {
        written = { path, data };
      },
    };
  };

  const invoke = async (argv: string[]): Promise<Captured> => {
    let out = '';
    let err = '';
    const io: CliIO = {
      readFile: () => {
        throw new Error('plugin commands do not read files');
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

  beforeEach(() => {
    written = undefined;
    deps = makeDeps();
  });

  it('routes plugins/transcribe/export as plugin commands', () => {
    expect(isPluginsCommand('plugins')).toBe(true);
    expect(isPluginsCommand('transcribe')).toBe(true);
    expect(isPluginsCommand('export')).toBe(true);
    expect(isPluginsCommand('play')).toBe(false);
    expect(isPluginsCommand(undefined)).toBe(false);
  });

  it('lists registered plugins with their capabilities and status', async () => {
    const r = await invoke(['plugins', 'list']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('whisper-offline v1.0.0 [subtitle-provider] active');
    expect(r.out).toContain('anki-exporter v1.0.0 [exporter] active');
  });

  it('transcribes offline into a word-timed document', async () => {
    const r = await invoke(['transcribe', 'movie.mkv', '--lang', 'en']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[0-800] hello there');
    expect(r.out).toContain('    hello [0-400]');
  });

  it('exports saved vocabulary as Anki TSV to stdout, sorted by id', async () => {
    const r = await invoke(['export', 'anki']);
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      'hello\thello there\ten learning\nfine\tI am fine\ten learning\n',
    );
  });

  it('exports to a file when --out is given', async () => {
    const r = await invoke(['export', 'anki', '--out', 'cards.tsv']);
    expect(r.code).toBe(0);
    expect(written?.path).toBe('cards.tsv');
    expect(written?.data).toContain('hello\thello there\ten learning');
    expect(r.out).toContain('wrote 2 card(s) to cards.tsv');
  });

  it('isolates a failing plugin: list reports it, others still work', async () => {
    deps = makeDeps([new BrokenPlugin()]);
    const list = await invoke(['plugins', 'list']);
    expect(list.out).toContain('broken v0.0.1 [exporter] failed: boom');
    expect(list.out).toContain('anki-exporter v1.0.0 [exporter] active');
    // A fresh registry (same plugins) still transcribes despite the bad plugin.
    deps = makeDeps([new BrokenPlugin()]);
    const t = await invoke(['transcribe', 'movie.mkv', '--lang', 'en']);
    expect(t.code).toBe(0);
    expect(t.out).toContain('hello there');
  });

  it('rejects bad input with usage exit code 2', async () => {
    expect((await invoke(['plugins', 'nope'])).code).toBe(2);
    expect((await invoke(['transcribe'])).code).toBe(2); // no mediaId
    expect((await invoke(['transcribe', 'm.mkv'])).code).toBe(2); // no --lang
    expect((await invoke(['transcribe', 'm.mkv', '--lang', '??'])).code).toBe(2);
    expect((await invoke(['export', 'quizlet'])).code).toBe(2); // unknown target
  });
});
