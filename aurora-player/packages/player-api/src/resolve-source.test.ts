import type { MediaPackage } from '@aurora/domain';
import { describe, expect, it } from 'vitest';
import {
  requiresNetworkConsent,
  resolveMediaSource,
  type SourceInput,
} from './resolve-source.js';

const pkg = (over: Partial<MediaPackage['video']> = {}): MediaPackage => ({
  id: 'pkg-1',
  video: { uri: 'https://cdn.example/clip.mp4', durationMs: 120_000, ...over },
  subtitles: [{ hasWordTimings: true }],
  meta: {
    title: 'A clip',
    sourceLang: 'en',
    learningLang: 'ja',
    durationMs: 99_000,
  },
});

describe('resolveMediaSource', () => {
  it('normalizes a raw URI, deriving a stable id', () => {
    const input: SourceInput = { kind: 'uri', uri: 'file:///data/v.mp4' };
    expect(resolveMediaSource(input)).toEqual({
      id: 'uri:file:///data/v.mp4',
      uri: 'file:///data/v.mp4',
    });
  });

  it('carries an optional title/duration on a raw URI', () => {
    const input: SourceInput = {
      kind: 'uri',
      uri: 'https://x/v.mp4',
      title: 'Hi',
      durationMs: 5000,
    };
    expect(resolveMediaSource(input)).toEqual({
      id: 'uri:https://x/v.mp4',
      uri: 'https://x/v.mp4',
      title: 'Hi',
      durationMs: 5000,
    });
  });

  it('normalizes a package, preferring video duration and keeping its id', () => {
    expect(resolveMediaSource({ kind: 'package', pkg: pkg() })).toEqual({
      id: 'pkg-1',
      uri: 'https://cdn.example/clip.mp4',
      title: 'A clip',
      durationMs: 120_000,
    });
  });

  it('falls back to meta duration, and omits duration when unknown', () => {
    const metaOnly = pkg();
    const withMeta = resolveMediaSource({
      kind: 'package',
      pkg: { ...metaOnly, video: { uri: metaOnly.video.uri } },
    });
    expect(withMeta.durationMs).toBe(99_000);

    const noDuration = resolveMediaSource({
      kind: 'package',
      pkg: {
        ...metaOnly,
        video: { uri: 'file:///v.mp4' },
        meta: { title: 't', sourceLang: 'en', learningLang: 'ja' },
      },
    });
    expect('durationMs' in noDuration).toBe(false);
  });
});

describe('requiresNetworkConsent', () => {
  it('is false for a local file URI', () => {
    expect(
      requiresNetworkConsent({ kind: 'uri', uri: 'file:///data/v.mp4' }),
    ).toBe(false);
    expect(requiresNetworkConsent({ kind: 'uri', uri: '/data/v.mp4' })).toBe(false);
  });

  it('is true for a remote URL', () => {
    expect(
      requiresNetworkConsent({ kind: 'uri', uri: 'https://x/v.mp4' }),
    ).toBe(true);
  });

  it('follows the package video uri', () => {
    expect(requiresNetworkConsent({ kind: 'package', pkg: pkg() })).toBe(true);
    expect(
      requiresNetworkConsent({
        kind: 'package',
        pkg: { ...pkg(), video: { uri: 'file:///local.mp4' } },
      }),
    ).toBe(false);
  });
});
