import type { DataExport } from '@aurora/domain';
import { runDataSubjectContract } from '@aurora/privacy/dsar-contract';
import { runRetentionContract } from '@aurora/privacy/retention-contract';
import type {
  DataSubjectRepositories,
  RetentionRepositories,
} from '@aurora/privacy';
import {
  InMemoryConsentRepository,
  InMemoryReviewRepository,
  InMemoryVocabularyRepository,
  openLearningDatabase,
  SqliteConsentRepository,
  SqliteReviewRepository,
  SqliteVocabularyRepository,
} from '@aurora/storage';
import { describe, expect, it } from 'vitest';
import { runData, type DataDeps } from './data.js';
import type { CliIO } from './run.js';

/**
 * Composition-root test for data-subject rights (plan/12): the SAME
 * `runDataSubjectContract` runs against the REAL in-memory and SQLite adapters
 * the composition root wires (the LSP proof for the whole export/erase path on
 * real backends), and the CLI `data export|erase` surface is exercised
 * end-to-end — offline and deterministic (injected clock, :memory: DB).
 */
runDataSubjectContract({
  name: 'real in-memory adapters',
  makeRepos: (): DataSubjectRepositories => ({
    vocab: new InMemoryVocabularyRepository(),
    reviews: new InMemoryReviewRepository(),
    consent: new InMemoryConsentRepository(),
  }),
});

// Track the DB handle structurally (cli does not depend on better-sqlite3).
const dbs = new WeakMap<DataSubjectRepositories, { close: () => void }>();
runDataSubjectContract({
  name: 'real SQLite adapters',
  makeRepos: (): DataSubjectRepositories => {
    const db = openLearningDatabase();
    const repos: DataSubjectRepositories = {
      vocab: new SqliteVocabularyRepository(db),
      reviews: new SqliteReviewRepository(db),
      consent: new SqliteConsentRepository(db),
    };
    dbs.set(repos, db);
    return repos;
  },
  dispose: (repos) => dbs.get(repos)?.close(),
});

// The retention (storage-limitation) contract runs against the SAME real
// adapters — the LSP proof for automatic expiry on both backends.
runRetentionContract({
  name: 'real in-memory adapters',
  makeRepos: (): RetentionRepositories => ({
    vocab: new InMemoryVocabularyRepository(),
    reviews: new InMemoryReviewRepository(),
  }),
});

const retentionDbs = new WeakMap<RetentionRepositories, { close: () => void }>();
runRetentionContract({
  name: 'real SQLite adapters',
  makeRepos: (): RetentionRepositories => {
    const db = openLearningDatabase();
    const repos: RetentionRepositories = {
      vocab: new SqliteVocabularyRepository(db),
      reviews: new SqliteReviewRepository(db),
    };
    retentionDbs.set(repos, db);
    return repos;
  },
  dispose: (repos) => retentionDbs.get(repos)?.close(),
});

const AT = 1_700_000_000_000;
const DAY = 86_400_000;

interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

const makeHarness = (): {
  deps: DataDeps;
  repos: DataSubjectRepositories;
  invoke: (argv: string[]) => Promise<Captured>;
  files: Map<string, string>;
} => {
  const repos: DataSubjectRepositories = {
    vocab: new InMemoryVocabularyRepository(),
    reviews: new InMemoryReviewRepository(),
    consent: new InMemoryConsentRepository(),
  };
  const files = new Map<string, string>();
  const deps: DataDeps = {
    repos,
    now: () => AT,
    writeFile: (path, data) => {
      files.set(path, data);
    },
  };
  const invoke = async (argv: string[]): Promise<Captured> => {
    let out = '';
    let err = '';
    const io: CliIO = {
      readFile: () => {
        throw new Error('unused');
      },
      write: (t) => {
        out += t;
      },
      writeError: (t) => {
        err += t;
      },
    };
    const code = await runData(argv, io, deps);
    return { out, err, code };
  };
  return { deps, repos, invoke, files };
};

describe('aurora data slice', () => {
  it('exports the user data as JSON, then erases it, then re-exports empty', async () => {
    const { repos, invoke } = makeHarness();
    await repos.vocab.upsert({
      id: 'en:hello',
      lemma: 'hello' as never,
      lang: 'en' as never,
      status: 'learning',
      createdAt: AT,
    });
    await repos.consent.grant('telemetry', AT);

    const exported = await invoke(['data', 'export']);
    expect(exported.code).toBe(0);
    const snapshot = JSON.parse(exported.out) as DataExport;
    expect(snapshot.version).toBe(1);
    expect(snapshot.exportedAt).toBe(AT);
    expect(snapshot.vocab.map((e) => e.id)).toEqual(['en:hello']);
    expect(snapshot.consent).toEqual([
      { use: 'telemetry', granted: true, at: AT },
    ]);

    const erased = await invoke(['data', 'erase']);
    expect(erased.code).toBe(0);
    expect(erased.out).toContain('erased');

    const again = JSON.parse((await invoke(['data', 'export'])).out) as DataExport;
    expect(again.vocab).toEqual([]);
    expect(again.consent).toEqual([]);
  });

  it('writes the snapshot to a file with --out', async () => {
    const { repos, invoke, files } = makeHarness();
    await repos.vocab.upsert({
      id: 'en:hi',
      lemma: 'hi' as never,
      lang: 'en' as never,
      status: 'learning',
      createdAt: AT,
    });
    const r = await invoke(['data', 'export', '--out', 'export.json']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('to export.json');
    const written = JSON.parse(files.get('export.json') ?? '') as DataExport;
    expect(written.vocab.map((e) => e.id)).toEqual(['en:hi']);
  });

  it('prunes learning data older than the window, keeps fresh data', async () => {
    const { repos, invoke } = makeHarness();
    await repos.vocab.upsert({
      id: 'old',
      lemma: 'old' as never,
      lang: 'en' as never,
      status: 'learning',
      createdAt: AT - 40 * DAY,
    });
    await repos.vocab.upsert({
      id: 'new',
      lemma: 'new' as never,
      lang: 'en' as never,
      status: 'learning',
      createdAt: AT - 1 * DAY,
    });

    const r = await invoke(['data', 'prune', '--older-than', '30']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('deleted 1 word(s)');
    expect((await repos.vocab.list()).map((v) => v.id)).toEqual(['new']);
  });

  it('dry-run prune reports would-delete but removes nothing', async () => {
    const { repos, invoke } = makeHarness();
    await repos.vocab.upsert({
      id: 'old',
      lemma: 'old' as never,
      lang: 'en' as never,
      status: 'learning',
      createdAt: AT - 40 * DAY,
    });

    const r = await invoke(['data', 'prune', '--older-than', '30', '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('would delete 1 word(s)');
    expect((await repos.vocab.list()).map((v) => v.id)).toEqual(['old']);
  });

  it('rejects prune without a valid --older-than (exit 2)', async () => {
    const r = await makeHarness().invoke(['data', 'prune']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--older-than');
  });

  it('rejects an unknown data subcommand with exit 2', async () => {
    const r = await makeHarness().invoke(['data', 'wat']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown data subcommand');
  });

  it('errors when --out is given but no writer is injected', async () => {
    const repos: DataSubjectRepositories = {
      vocab: new InMemoryVocabularyRepository(),
      reviews: new InMemoryReviewRepository(),
      consent: new InMemoryConsentRepository(),
    };
    let err = '';
    const io: CliIO = {
      readFile: () => '',
      write: () => {
        /* discarded */
      },
      writeError: (t) => {
        err += t;
      },
    };
    const code = await runData(['data', 'export', '--out', 'x.json'], io, {
      repos,
      now: () => AT,
    });
    expect(code).toBe(2);
    expect(err).toContain('--out is not supported here');
  });
});
