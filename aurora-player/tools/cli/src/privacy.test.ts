import { describe, expect, it } from 'vitest';
import { isPrivacyCommand } from './privacy.js';
import { run, type CliIO } from './run.js';

/**
 * `privacy disclose` is the CLI echo of the data-processing transparency
 * manifest (plan/12 · Art.13/14/30): it must list every disclosed capability
 * with its uses + purpose, filter by a single data use, and reject an unknown
 * one. Pure static metadata — no fs, no db, no network.
 */
interface Captured {
  readonly out: string;
  readonly err: string;
  readonly code: number;
}

const invoke = (argv: string[]): Captured => {
  let out = '';
  let err = '';
  const io: CliIO = {
    readFile: () => {
      throw new Error('privacy commands read no files');
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

describe('aurora privacy disclose', () => {
  it('routes `privacy` as a privacy command', () => {
    expect(isPrivacyCommand('privacy')).toBe(true);
    expect(isPrivacyCommand('consent')).toBe(false);
    expect(isPrivacyCommand(undefined)).toBe(false);
  });

  it('lists every disclosed capability with uses, retention and purpose', () => {
    const r = invoke(['privacy', 'disclose']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('streaming-playback');
    expect(r.out).toContain('online-ai');
    expect(r.out).toContain('marketplace');
    expect(r.out).toContain('telemetry');
    expect(r.out).toContain('retention 30d'); // online-ai cache
    expect(r.out).toContain('not retained'); // streaming has no retention
    // Honest about what is NOT processed: pii is gated by nothing.
    expect(r.out).toContain('not processed: pii');
  });

  it('filters by a single data use', () => {
    const r = invoke(['privacy', 'disclose', '--use', 'telemetry']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('telemetry');
    expect(r.out).not.toContain('streaming-playback');
    // The "not processed" footer only shows for the full listing.
    expect(r.out).not.toContain('not processed');
  });

  it('supports --use=<cat> form and reports an empty result cleanly', () => {
    const r = invoke(['privacy', 'disclose', '--use=pii']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('no disclosed processing');
  });

  it('rejects an unknown data use (exit 2)', () => {
    const r = invoke(['privacy', 'disclose', '--use', 'bogus']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown data use');
  });

  it('errors on an unknown privacy subcommand (exit 2)', () => {
    const r = invoke(['privacy', 'frobnicate']);
    expect(r.code).toBe(2);
    expect(r.err).toContain('unknown privacy subcommand');
  });
});
