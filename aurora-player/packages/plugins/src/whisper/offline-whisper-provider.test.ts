import { languageCode } from '@aurora/domain';
import { runSubtitleProviderContract } from '@aurora/subtitle/contract/provider';
import { describe, expect, it } from 'vitest';
import { OfflineWhisperProvider } from './offline-whisper-provider.js';

const en = (() => {
  const r = languageCode('en');
  if (!r.ok) throw r.error;
  return r.value;
})();

runSubtitleProviderContract({
  name: 'OfflineWhisperProvider',
  makeProvider: () => new OfflineWhisperProvider(),
  input: { mediaId: 'movie.mkv' },
  lang: en,
  minLines: 2,
  expectWordTimings: true,
});

describe('OfflineWhisperProvider', () => {
  it('produces a deterministic word-timed document tagged with the media id', async () => {
    const doc = await new OfflineWhisperProvider().transcribe(
      { mediaId: 'movie.mkv' },
      en,
    );
    expect(doc.hasWordTimings).toBe(true);
    expect(doc.meta.title).toBe('movie.mkv');
    expect(doc.lines.map((l) => l.text)).toEqual(['hello there', 'this is aurora']);
    // Word ranges are contiguous 400ms slices feeding the learning loop.
    const first = doc.lines[0]!;
    expect(first.words?.map((w) => w.range?.startMs)).toEqual([0, 400]);
    expect(first.words?.[0]?.lemma).toBe('hello');
  });
});
