import { InMemoryConsentRepository } from '@aurora/storage';
import { describe, expect, it } from 'vitest';
import { runConsent, type ConsentDeps } from './consent.js';
import type { CliIO } from './run.js';

/**
 * Composition-root test for the runtime consent gate (plan/12; rule ①.F.20's
 * privacy half): an online / third-party capability must be refused until the
 * user grants the required data uses, then permitted, then refused again after
 * revoke — proven through the CLI `consent` + `fetch` surface, fully offline and
 * deterministic (injected clock, in-memory repo).
 */
interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

/** One repo shared across a sequence of invocations so state persists. */
const makeInvoke = (deps: ConsentDeps) => async (argv: string[]): Promise<Captured> => {
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
  const code = await runConsent(argv, io, deps);
  return { out, err, code };
};

const freshDeps = (): ConsentDeps => ({
  consent: new InMemoryConsentRepository(),
  now: () => 1_700_000_000_000, // fixed injected clock (rule ①.C.13)
});

describe('aurora consent slice', () => {
  it('shows every data use as not granted initially', async () => {
    const r = await makeInvoke(freshDeps())(['consent', 'show']);
    expect(r.code).toBe(0);
    expect(r.out).toBe(
      'network: not granted\n' +
        'third-party: not granted\n' +
        'pii: not granted\n' +
        'telemetry: not granted\n',
    );
  });

  it('runs the deny -> grant -> allow -> revoke -> deny loop for a gated capability', async () => {
    const invoke = makeInvoke(freshDeps());

    // Denied before consent: exit 1, lists exactly the missing uses + the hint.
    const denied = await invoke(['fetch', 'clip.yt']);
    expect(denied.code).toBe(1);
    expect(denied.err).toContain('consent required for: network, third-party');
    expect(denied.err).toContain('run: aurora consent grant network third-party');

    // Grant both required uses.
    const grant = await invoke(['consent', 'grant', 'network', 'third-party']);
    expect(grant.code).toBe(0);
    expect(grant.out).toBe('granted: network, third-party\n');

    // Now permitted: the injected capability runs.
    const allowed = await invoke(['fetch', 'clip.yt']);
    expect(allowed.code).toBe(0);
    expect(allowed.out).toBe('fetched clip.yt\n');

    // Revoke one required use — the gate closes again.
    const revoke = await invoke(['consent', 'revoke', 'third-party']);
    expect(revoke.code).toBe(0);
    const reDenied = await invoke(['fetch', 'clip.yt']);
    expect(reDenied.code).toBe(1);
    expect(reDenied.err).toContain('consent required for: third-party');
  });

  it('persists a grant so `consent show` reflects it', async () => {
    const invoke = makeInvoke(freshDeps());
    await invoke(['consent', 'grant', 'telemetry']);
    const r = await invoke(['consent', 'show']);
    expect(r.out).toContain('telemetry: granted');
    expect(r.out).toContain('network: not granted');
  });

  it('runs an injected online binding only once permitted', async () => {
    const deps: ConsentDeps = {
      ...freshDeps(),
      fetchOnline: (ref) => Promise.resolve(`captions for ${ref}`),
    };
    const invoke = makeInvoke(deps);
    await invoke(['consent', 'grant', 'network', 'third-party']);
    const r = await invoke(['fetch', 'https://v/1']);
    expect(r.out).toBe('captions for https://v/1\n');
  });

  it('rejects an unknown data use with exit 2', async () => {
    const r = await makeInvoke(freshDeps())(['consent', 'grant', 'bogus']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown data use "bogus"');
  });

  it('rejects grant with no data use, and an unknown subcommand, with exit 2', async () => {
    const invoke = makeInvoke(freshDeps());
    expect((await invoke(['consent', 'grant'])).code).toBe(2);
    expect((await invoke(['consent', 'wat'])).code).toBe(2);
    expect((await invoke(['fetch'])).code).toBe(2);
  });
});
