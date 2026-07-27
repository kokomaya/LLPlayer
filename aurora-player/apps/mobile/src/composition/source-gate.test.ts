import { describe, expect, it } from 'vitest';
import { emptyConsent, withConsent, type ConsentState } from '@aurora/domain';
import type { MediaPackage } from '@aurora/domain';
import type { SourceInput } from '@aurora/player-api';
import { STREAMING_DATA_USES, decidePlayback } from './source-gate.js';

// The source-selection gate is the runtime half of the online red line: an
// offline pick always plays, a streaming pick only plays once `network` consent
// exists, and otherwise it reports exactly what is missing. Pure — Node-tested.

const AT = 1_700_000_000_000;
const granted = (): ConsentState => withConsent(emptyConsent(), 'network', true, AT);

const REMOTE_PKG: MediaPackage = {
  id: 'pkg-remote',
  video: { uri: 'https://cdn.example/sintel.mp4', durationMs: 888_000 },
  subtitles: [{ language: 'en', format: 'srt', hasWordTimings: true }],
  meta: { title: 'Sintel', sourceLang: 'en', learningLang: 'ja' },
};

describe('decidePlayback', () => {
  it('gates only on `network` (not third-party) for streaming', () => {
    expect(STREAMING_DATA_USES).toEqual(['network']);
  });

  it('lets a local file play with no consent at all', () => {
    const input: SourceInput = { kind: 'uri', uri: 'file:///movies/clip.mp4', title: 'Clip' };
    const decision = decidePlayback(input, emptyConsent());
    expect(decision.ready).toBe(true);
    if (decision.ready) {
      expect(decision.media.uri).toBe('file:///movies/clip.mp4');
      expect(decision.media.title).toBe('Clip');
    }
  });

  it('blocks a URL until network consent is granted, naming what is missing', () => {
    const input: SourceInput = { kind: 'uri', uri: 'https://cdn.example/a.mp4' };
    const decision = decidePlayback(input, emptyConsent());
    expect(decision.ready).toBe(false);
    if (!decision.ready) {
      expect(decision.missing).toEqual(['network']);
    }
  });

  it('opens a URL once network consent is granted', () => {
    const input: SourceInput = { kind: 'uri', uri: 'https://cdn.example/a.mp4' };
    const decision = decidePlayback(input, granted());
    expect(decision.ready).toBe(true);
    if (decision.ready) {
      expect(decision.media.uri).toBe('https://cdn.example/a.mp4');
    }
  });

  it('gates a marketplace package by its video URI too', () => {
    const input: SourceInput = { kind: 'package', pkg: REMOTE_PKG };
    expect(decidePlayback(input, emptyConsent()).ready).toBe(false);

    const ok = decidePlayback(input, granted());
    expect(ok.ready).toBe(true);
    if (ok.ready) {
      expect(ok.media.id).toBe('pkg-remote');
      expect(ok.media.uri).toBe('https://cdn.example/sintel.mp4');
      expect(ok.media.durationMs).toBe(888_000);
    }
  });
});
