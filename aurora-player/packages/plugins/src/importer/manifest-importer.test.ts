import { describe, expect, it } from 'vitest';
import { runMediaImporterContract } from '../contract/importer-contract.js';
import { ManifestMediaImporter } from './manifest-importer.js';
import type { MediaRef } from './port.js';

/**
 * A minimal offline manifest: two SRT cues embedded inline, no filesystem or
 * network. Exercises the "external media → subtitle tracks" path deterministically.
 */
const MANIFEST = JSON.stringify({
  mediaId: 'movie.mkv',
  title: 'Test Movie',
  durationMs: 35000,
  subtitles: [
    {
      filename: 'en.srt',
      content:
        '1\n00:00:00,000 --> 00:00:02,000\nhello there\n\n' +
        '2\n00:00:02,000 --> 00:00:04,000\nthis is aurora\n',
    },
  ],
});

const supported: MediaRef = { uri: 'movie.json', content: MANIFEST };

runMediaImporterContract({
  name: 'ManifestMediaImporter',
  makeImporter: () => new ManifestMediaImporter(),
  supported,
  unsupported: { uri: 'https://youtu.be/abc123' },
  deterministic: true,
});

describe('ManifestMediaImporter specifics', () => {
  it('maps manifest metadata onto ImportedMedia', async () => {
    const media = await new ManifestMediaImporter().import(supported);
    expect(media.mediaId).toBe('movie.mkv');
    expect(media.title).toBe('Test Movie');
    expect(media.durationMs).toBe(35000);
    expect(media.subtitleTracks).toHaveLength(1);
    expect(media.subtitleTracks[0]?.lines).toHaveLength(2);
    expect(media.subtitleTracks[0]?.lines[0]?.text).toBe('hello there');
  });

  it('omits optional fields the manifest does not provide (ISP)', async () => {
    const ref: MediaRef = {
      uri: 'bare.json',
      content: JSON.stringify({
        mediaId: 'bare',
        subtitles: [
          { filename: 'x.srt', content: '1\n00:00:01,000 --> 00:00:02,000\nhi\n' },
        ],
      }),
    };
    const media = await new ManifestMediaImporter().import(ref);
    expect('title' in media).toBe(false);
    expect('durationMs' in media).toBe(false);
  });

  it('rejects a ref without inline content', async () => {
    await expect(
      new ManifestMediaImporter().import({ uri: 'movie.json' }),
    ).rejects.toThrow(/inline manifest content/);
  });

  it('fails loud on malformed manifests', async () => {
    const importer = new ManifestMediaImporter();
    await expect(
      importer.import({ uri: 'a.json', content: 'not json' }),
    ).rejects.toThrow(/invalid JSON/);
    await expect(
      importer.import({ uri: 'a.json', content: '{"subtitles":[]}' }),
    ).rejects.toThrow(/mediaId/);
    await expect(
      importer.import({ uri: 'a.json', content: '{"mediaId":"m"}' }),
    ).rejects.toThrow(/subtitles.*array/);
    await expect(
      importer.import({
        uri: 'a.json',
        content: JSON.stringify({
          mediaId: 'm',
          subtitles: [{ filename: 'x.bin', content: 'garbage-not-a-cue' }],
        }),
      }),
    ).rejects.toThrow(/parse failed/);
  });
});
