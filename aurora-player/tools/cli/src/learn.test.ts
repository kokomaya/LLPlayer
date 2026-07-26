import { createDefaultRegistry } from '@aurora/dictionary';
import { FsrsScheduler } from '@aurora/learning';
import {
  InMemoryReviewRepository,
  InMemoryVocabularyRepository,
} from '@aurora/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { isLearnCommand, runLearn, type LearnDeps } from './learn.js';
import type { CliIO } from './run.js';

/**
 * Composition-root integration test for the learning loop (plan/09 · M3 DoD):
 * wire the dictionary, FSRS scheduler and the two repositories together through
 * their ports only, then drive the whole define → add → due → grade journey via
 * the CLI surface. In-memory adapters + an explicit `--at` clock keep it
 * deterministic — no filesystem, no wall clock.
 */
const T0 = 1_700_000_000_000;

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

describe('aurora learning loop', () => {
  let deps: LearnDeps;

  const invoke = async (argv: string[]): Promise<Captured> => {
    let out = '';
    let err = '';
    const io: CliIO = {
      readFile: () => {
        throw new Error('learning commands do not read files');
      },
      write: (t) => {
        out += t;
      },
      writeError: (t) => {
        err += t;
      },
    };
    const code = await runLearn(argv, io, deps);
    return { out, err, code };
  };

  beforeEach(() => {
    deps = {
      dictionary: createDefaultRegistry(),
      vocab: new InMemoryVocabularyRepository(),
      reviews: new InMemoryReviewRepository(),
      scheduler: new FsrsScheduler(),
      now: () => T0,
    };
  });

  it('routes define/vocab/review as learning commands', () => {
    expect(isLearnCommand('define')).toBe(true);
    expect(isLearnCommand('vocab')).toBe(true);
    expect(isLearnCommand('review')).toBe(true);
    expect(isLearnCommand('play')).toBe(false);
    expect(isLearnCommand(undefined)).toBe(false);
  });

  it('defines a known word from the built-in dictionary', async () => {
    const r = await invoke(['define', 'Hello!', '--lang', 'en']);
    expect(r.code).toBe(0);
    expect(r.out.toLowerCase()).toContain('hello');
    expect(r.out).toContain('[builtin]');
  });

  it('reports a miss for an unknown word without erroring', async () => {
    const r = await invoke(['define', 'zzzznotaword', '--lang', 'en']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('no definition');
  });

  it('drives the full add → due → grade → reschedule loop', async () => {
    const added = await invoke(['vocab', 'add', 'Hello!', '--lang', 'en', '--at', String(T0)]);
    expect(added.code).toBe(0);
    expect(added.out).toContain('added en:hello');

    // Idempotent: re-adding does not reset the schedule.
    const again = await invoke(['vocab', 'add', 'hello', '--lang', 'en', '--at', String(T0)]);
    expect(again.out).toContain('already saved en:hello');

    const list = await invoke(['vocab', 'list']);
    expect(list.out).toContain('en:hello');
    expect(list.out).toContain('[learning]');

    // A fresh card is due immediately.
    const dueNow = await invoke(['review', 'due', '--at', String(T0)]);
    expect(dueNow.out).toContain('en:hello');

    // Grading "good" pushes the next due date into the future.
    const graded = await invoke(['review', 'grade', 'en:hello', 'good', '--at', String(T0)]);
    expect(graded.code).toBe(0);
    expect(graded.out).toContain('graded en:hello good');

    const card = await deps.reviews.get('en:hello');
    expect(card!.due).toBeGreaterThan(T0);
    expect(card!.reps).toBe(1);

    // Nothing is due at T0 anymore.
    const dueAfter = await invoke(['review', 'due', '--at', String(T0)]);
    expect(dueAfter.out).toContain('nothing due');
  });

  it('lists nothing before any word is saved', async () => {
    const r = await invoke(['vocab', 'list']);
    expect(r.out).toContain('no saved words');
  });

  it('errors on grading a missing card (exit 1)', async () => {
    const r = await invoke(['review', 'grade', 'en:ghost', 'good', '--at', String(T0)]);
    expect(r.code).toBe(1);
    expect(r.err).toContain('No review card');
  });

  it('rejects bad input with usage exit code 2', async () => {
    expect((await invoke(['define', '--lang', 'en'])).code).toBe(2); // missing word
    expect((await invoke(['define', 'hello'])).code).toBe(2); // missing --lang
    expect((await invoke(['define', 'hello', '--lang', '??'])).code).toBe(2); // bad lang
    expect((await invoke(['vocab', 'add', 'hi', '--lang', 'en', '--at', 'x'])).code).toBe(2);
    expect((await invoke(['vocab', 'nope'])).code).toBe(2);
    expect((await invoke(['review', 'grade', 'en:hello', 'meh'])).code).toBe(2); // bad rating
    expect((await invoke(['review', 'grade', 'en:hello'])).code).toBe(2); // missing rating
    expect((await invoke(['review', 'nope'])).code).toBe(2);
  });
});
