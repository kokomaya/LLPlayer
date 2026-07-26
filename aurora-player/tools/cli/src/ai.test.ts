import { StaticLLMProvider, type ILLMProvider } from '@aurora/ai';
import { InMemoryCacheRepository } from '@aurora/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { isAiCommand, runAi, type AiDeps } from './ai.js';
import type { CliIO } from './run.js';

/**
 * Composition-root integration test for the AI slice (plan/09 · M4 DoD): wire a
 * provider + the in-memory cache through their ports and drive translate/explain
 * via the CLI surface. Default-offline + an injected clock keep it deterministic
 * — no network, no key, no wall clock.
 */
const T0 = 1_700_000_000_000;

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

/** Offline provider that counts real calls, to prove cache dedup. */
class CountingProvider implements ILLMProvider {
  readonly id = 'offline';
  calls = 0;
  complete(req: { prompt: string }): Promise<{ text: string; providerId: string }> {
    this.calls += 1;
    return Promise.resolve({ text: `T(${req.prompt.length})`, providerId: this.id });
  }
}

describe('aurora AI commands', () => {
  let deps: AiDeps;
  let counting: CountingProvider;

  const invoke = async (argv: string[]): Promise<Captured> => {
    let out = '';
    let err = '';
    const io: CliIO = {
      readFile: () => {
        throw new Error('AI commands do not read files');
      },
      write: (t) => {
        out += t;
      },
      writeError: (t) => {
        err += t;
      },
    };
    const code = await runAi(argv, io, deps);
    return { out, err, code };
  };

  beforeEach(() => {
    counting = new CountingProvider();
    deps = {
      offline: counting,
      cache: new InMemoryCacheRepository(),
      now: () => T0,
    };
  });

  it('routes translate/explain as AI commands', () => {
    expect(isAiCommand('translate')).toBe(true);
    expect(isAiCommand('explain')).toBe(true);
    expect(isAiCommand('play')).toBe(false);
    expect(isAiCommand(undefined)).toBe(false);
  });

  it('translates offline and tags the provider', async () => {
    const r = await invoke(['translate', 'hello', '--to', 'es']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[offline]');
    expect(counting.calls).toBe(1);
  });

  it('serves a repeated translation from cache without re-calling', async () => {
    const first = await invoke(['translate', 'hello', '--to', 'es']);
    const second = await invoke(['translate', 'hello', '--to', 'es']);
    expect(first.out).not.toContain('cached');
    expect(second.out).toContain('· cached');
    expect(counting.calls).toBe(1); // dedup across CLI invocations
  });

  it('explains grammar and a word (with context) offline', async () => {
    const g = await invoke(['explain', 'grammar', 'I', 'am', 'fine']);
    expect(g.code).toBe(0);
    expect(g.out).toContain('[offline]');
    const w = await invoke(['explain', 'word', 'fine', '--context', 'I am fine']);
    expect(w.code).toBe(0);
    expect(w.out).toContain('[offline]');
  });

  it('hybrid mode degrades to offline when the online provider fails', async () => {
    const failing: ILLMProvider = {
      id: 'online',
      complete: () => Promise.reject(new Error('network down')),
    };
    deps = {
      offline: new StaticLLMProvider(),
      online: failing,
      cache: new InMemoryCacheRepository(),
      now: () => T0,
    };
    const r = await invoke(['translate', 'hello', '--to', 'es', '--mode', 'hybrid']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('[offline]');
  });

  it('rejects bad input with usage exit code 2', async () => {
    expect((await invoke(['translate', '--to', 'es'])).code).toBe(2); // no text
    expect((await invoke(['translate', 'hi'])).code).toBe(2); // no --to
    expect((await invoke(['translate', 'hi', '--to', '??'])).code).toBe(2); // bad lang
    expect((await invoke(['translate', 'hi', '--to', 'es', '--mode', 'nope'])).code).toBe(2);
    expect((await invoke(['translate', 'hi', '--to', 'es', '--mode', 'online'])).code).toBe(2); // no online
    expect((await invoke(['translate', 'hi', '--to', 'es', '--provider', 'ghost'])).code).toBe(2);
    expect((await invoke(['explain', 'grammar'])).code).toBe(2); // no text
    expect((await invoke(['explain', 'word'])).code).toBe(2); // no word
    expect((await invoke(['explain', 'nope'])).code).toBe(2); // bad subcommand
  });
});
