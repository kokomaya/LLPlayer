import { describe, expect, it } from 'vitest';
import { resolveCatalogConfig } from './catalog-config.js';

// resolveCatalogConfig decides whether the marketplace uses a live HTTP backend
// (debug → local server, release → deployed) or falls back to the offline demo
// catalog. These tests pin the "return null → fall back" contract: disabled,
// blank, or malformed inputs must not produce a half-built config.

describe('resolveCatalogConfig', () => {
  it('resolves a valid enabled config, trimming trailing slashes', () => {
    expect(
      resolveCatalogConfig({
        enabled: true,
        baseUrl: 'http://10.0.2.2:8787/',
        token: 'dev-local-token',
      }),
    ).toEqual({ baseUrl: 'http://10.0.2.2:8787', token: 'dev-local-token' });
  });

  it('trims surrounding whitespace on url and token', () => {
    expect(
      resolveCatalogConfig({
        enabled: true,
        baseUrl: '  https://market.example  ',
        token: '  t0ken  ',
      }),
    ).toEqual({ baseUrl: 'https://market.example', token: 't0ken' });
  });

  it('returns null when disabled (→ host uses the demo catalog)', () => {
    expect(
      resolveCatalogConfig({
        enabled: false,
        baseUrl: 'http://10.0.2.2:8787',
        token: 'dev-local-token',
      }),
    ).toBeNull();
  });

  it('returns null when the url or token is missing/blank', () => {
    expect(resolveCatalogConfig({ enabled: true, token: 't' })).toBeNull();
    expect(
      resolveCatalogConfig({ enabled: true, baseUrl: 'http://x:1' }),
    ).toBeNull();
    expect(
      resolveCatalogConfig({ enabled: true, baseUrl: '   ', token: 't' }),
    ).toBeNull();
    expect(
      resolveCatalogConfig({ enabled: true, baseUrl: 'http://x:1', token: '  ' }),
    ).toBeNull();
  });

  it('returns null for a non-http(s) or malformed url', () => {
    expect(
      resolveCatalogConfig({ enabled: true, baseUrl: 'ftp://x', token: 't' }),
    ).toBeNull();
    expect(
      resolveCatalogConfig({ enabled: true, baseUrl: 'not a url', token: 't' }),
    ).toBeNull();
  });
});
