import { describe, expect, it } from 'vitest';
import type { MediaPackage, MissingRequirement } from './package.js';
import { summarizeMediaPackage, validateMediaPackage } from './package.js';

// A fully-valid baseline; each test removes/blanks exactly one element.
const valid = (over: Partial<MediaPackage> = {}): MediaPackage => ({
  id: 'pkg-1',
  video: { uri: 'https://cdn.example/clip.mp4', durationMs: 120_000, language: 'en' },
  subtitles: [{ language: 'en', format: 'whisperx', hasWordTimings: true }],
  meta: {
    title: 'A friendly clip',
    sourceLang: 'en',
    learningLang: 'ja',
    durationMs: 120_000,
  },
  ...over,
});

const errorReqs = (pkg: MediaPackage): MissingRequirement[] =>
  validateMediaPackage(pkg).errors.map((i) => i.requirement);
const warnReqs = (pkg: MediaPackage): MissingRequirement[] =>
  validateMediaPackage(pkg).warnings.map((i) => i.requirement);

describe('validateMediaPackage', () => {
  it('accepts a fully-valid package with no errors or warnings', () => {
    const result = validateMediaPackage(valid());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('flags a missing/blank video source', () => {
    expect(errorReqs(valid({ video: { uri: '' } }))).toContain('video-source');
    expect(errorReqs(valid({ video: { uri: '   ' } }))).toContain('video-source');
  });

  it('flags no subtitle track (and does not also warn about word timings)', () => {
    const result = validateMediaPackage(valid({ subtitles: [] }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((i) => i.requirement)).toContain('subtitle-track');
    expect(result.warnings.map((i) => i.requirement)).not.toContain('word-timings');
  });

  it('warns (not errors) when no track has word-level timings', () => {
    const pkg = valid({ subtitles: [{ language: 'en', hasWordTimings: false }] });
    const result = validateMediaPackage(pkg);
    expect(result.ok).toBe(true); // degraded, still usable
    expect(result.warnings.map((i) => i.requirement)).toContain('word-timings');
  });

  it('flags missing title / source language / learning language', () => {
    expect(errorReqs(valid({ meta: { ...valid().meta, title: '' } }))).toContain('title');
    expect(
      errorReqs(valid({ meta: { ...valid().meta, sourceLang: '' } })),
    ).toContain('source-language');
    expect(
      errorReqs(valid({ meta: { ...valid().meta, learningLang: '' } })),
    ).toContain('learning-language');
  });

  it('warns when duration is unknown from both video and meta', () => {
    const pkg = valid({
      video: { uri: 'file:///v.mp4' },
      meta: { title: 't', sourceLang: 'en', learningLang: 'ja' },
    });
    expect(warnReqs(pkg)).toContain('duration');
    expect(validateMediaPackage(pkg).ok).toBe(true);
  });

  it('does not warn about duration when only meta carries it', () => {
    const pkg = valid({
      video: { uri: 'file:///v.mp4' },
      meta: { title: 't', sourceLang: 'en', learningLang: 'ja', durationMs: 1000 },
    });
    expect(warnReqs(pkg)).not.toContain('duration');
  });

  it('accumulates every error for a fully-empty package (each issue typed)', () => {
    const empty = {
      id: 'x',
      video: { uri: '' },
      subtitles: [],
      meta: { title: '', sourceLang: '', learningLang: '' },
    } as MediaPackage;
    const result = validateMediaPackage(empty);
    expect(result.ok).toBe(false);
    expect(result.errors.map((i) => i.requirement).sort()).toEqual(
      ['learning-language', 'source-language', 'subtitle-track', 'title', 'video-source'].sort(),
    );
    // duration is a warning even in the empty case
    expect(result.warnings.map((i) => i.requirement)).toContain('duration');
    for (const issue of result.errors) expect(issue.severity).toBe('error');
    for (const issue of result.warnings) expect(issue.severity).toBe('warning');
  });

  it('is defensive against a malformed (untrusted) object', () => {
    const bad = { id: 'x' } as unknown as MediaPackage;
    const result = validateMediaPackage(bad);
    expect(result.ok).toBe(false); // does not throw
    expect(result.errors.map((i) => i.requirement)).toEqual(
      expect.arrayContaining(['video-source', 'subtitle-track', 'title']),
    );
  });
});

describe('summarizeMediaPackage', () => {
  it('derives a listing view, preferring video duration', () => {
    expect(summarizeMediaPackage(valid())).toEqual({
      id: 'pkg-1',
      title: 'A friendly clip',
      sourceLang: 'en',
      learningLang: 'ja',
      durationMs: 120_000,
      hasWordTimings: true,
    });
  });

  it('falls back to meta duration and omits it when unknown', () => {
    const metaOnly = summarizeMediaPackage(
      valid({ video: { uri: 'file:///v.mp4' }, meta: { ...valid().meta, durationMs: 99 } }),
    );
    expect(metaOnly.durationMs).toBe(99);

    const unknown = summarizeMediaPackage(
      valid({
        video: { uri: 'file:///v.mp4' },
        meta: { title: 't', sourceLang: 'en', learningLang: 'ja' },
      }),
    );
    expect('durationMs' in unknown).toBe(false);
  });

  it('reports hasWordTimings false when no track has them', () => {
    const s = summarizeMediaPackage(
      valid({ subtitles: [{ hasWordTimings: false }, { hasWordTimings: false }] }),
    );
    expect(s.hasWordTimings).toBe(false);
  });
});
