import { describe, expect, it, vi } from 'vitest';
import type { MediaPackage } from '@aurora/domain';
import {
  authHeaders,
  createHttpCatalogBackend,
  rehostMediaUri,
} from './http-catalog.js';

// createHttpCatalogBackend is the live REST backend the debug/release app uses in
// place of the offline demo catalog. It runs against an injected `fetch`, so
// these tests exercise the two device-only concerns fully in Node: Bearer auth on
// every call, and re-hosting the server's baked-in (often `localhost`) media URIs
// onto the base URL the device actually reached.

const CONFIG = { baseUrl: 'http://10.0.2.2:8787', token: 'dev-local-token' };
const BEARER = 'Bearer dev-local-token';

// A package exactly as the server serves it: URIs baked with the server's own
// origin (localhost) which the phone can't reach.
const SERVER_PKG: MediaPackage = {
  id: 'voa/tears_of_steel_720p',
  video: {
    uri: 'http://localhost:8787/media/voa%2Ftears_of_steel_720p/video',
    language: 'en',
  },
  subtitles: [
    {
      hasWordTimings: true,
      format: 'whisperx-json',
      uri: 'http://localhost:8787/media/voa%2Ftears_of_steel_720p/subtitles/voa-tears_of_steel_720p.whisperx.json',
      language: 'en',
    },
  ],
  meta: { title: 'Tears of Steel', sourceLang: 'en', learningLang: 'en' },
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('rehostMediaUri', () => {
  it('swaps the origin of a server /media/ uri onto the base url', () => {
    expect(
      rehostMediaUri(
        'http://localhost:8787/media/voa%2Fx/video',
        'http://10.0.2.2:8787',
      ),
    ).toBe('http://10.0.2.2:8787/media/voa%2Fx/video');
  });

  it('preserves the encoded id (%2F) and query string', () => {
    expect(
      rehostMediaUri(
        'http://localhost:8787/media/voa%2Fx/subtitles/a.json?v=2',
        'http://10.0.2.2:8787',
      ),
    ).toBe('http://10.0.2.2:8787/media/voa%2Fx/subtitles/a.json?v=2');
  });

  it('leaves an external (non-/media/) url untouched', () => {
    const cdn = 'https://cdn.example/gtv/BigBuckBunny.mp4';
    expect(rehostMediaUri(cdn, 'http://10.0.2.2:8787')).toBe(cdn);
  });

  it('joins a relative /media/ reference onto the base', () => {
    expect(rehostMediaUri('/media/x/video', 'http://10.0.2.2:8787/')).toBe(
      'http://10.0.2.2:8787/media/x/video',
    );
  });
});

describe('authHeaders', () => {
  it('builds the Bearer header', () => {
    expect(authHeaders('t')).toEqual({ authorization: 'Bearer t' });
  });
});

describe('createHttpCatalogBackend', () => {
  it('lists summaries with the Bearer header', async () => {
    const summaries = [
      {
        id: 'voa/tears_of_steel_720p',
        title: 'Tears of Steel',
        sourceLang: 'en',
        learningLang: 'en',
        hasWordTimings: true,
      },
    ];
    const fetch = vi.fn(async () => jsonResponse(summaries));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });

    expect(await backend.list()).toEqual(summaries);
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:8787/packages', {
      headers: { authorization: BEARER },
    });
  });

  it('gets a package and re-hosts its media + subtitle uris', async () => {
    const fetch = vi.fn(async () => jsonResponse(SERVER_PKG));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });

    const pkg = await backend.get('voa/tears_of_steel_720p');
    expect(pkg?.video.uri).toBe(
      'http://10.0.2.2:8787/media/voa%2Ftears_of_steel_720p/video',
    );
    expect(pkg?.subtitles[0]?.uri).toBe(
      'http://10.0.2.2:8787/media/voa%2Ftears_of_steel_720p/subtitles/voa-tears_of_steel_720p.whisperx.json',
    );
    // Word timings and the rest of the package survive re-hosting untouched.
    expect(pkg?.subtitles[0]?.hasWordTimings).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://10.0.2.2:8787/packages/voa%2Ftears_of_steel_720p',
      { headers: { authorization: BEARER } },
    );
  });

  it('returns undefined on 404', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'not found' }, 404));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });
    expect(await backend.get('missing')).toBeUndefined();
  });

  it('throws on a non-404 error status', async () => {
    const fetch = vi.fn(async () => jsonResponse({ error: 'unauthorized' }, 401));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });
    await expect(backend.list()).rejects.toThrow(/401/);
  });

  it('validates before uploading and never hits the network on a bad package', async () => {
    const fetch = vi.fn(async () => jsonResponse({ id: 'x' }, 201));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });
    const bad = { id: 'bad', video: { uri: '' }, subtitles: [], meta: {} } as unknown as MediaPackage;

    const result = await backend.upload(bad);
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('posts a valid upload with auth + json headers', async () => {
    const fetch = vi.fn(async () => jsonResponse({ id: SERVER_PKG.id }, 201));
    const backend = createHttpCatalogBackend(CONFIG, { fetch });

    const result = await backend.upload(SERVER_PKG);
    expect(result).toEqual({ ok: true, id: SERVER_PKG.id });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit?];
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      authorization: BEARER,
      'content-type': 'application/json',
    });
  });
});
