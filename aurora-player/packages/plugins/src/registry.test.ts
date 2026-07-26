import { describe, expect, it } from 'vitest';
import { PLAY_PROFILE, DESKTOP_PROFILE } from './distribution/policy.js';
import { AnkiExporterPlugin } from './exporter/anki-exporter.js';
import type { IMediaImporter, ImportedMedia } from './importer/port.js';
import type { Plugin, PluginContext } from './plugin.js';
import { PluginRegistry } from './registry.js';
import { WhisperPlugin } from './whisper/offline-whisper-provider.js';

/** A plugin whose activation always throws, to prove error isolation. */
class BrokenPlugin implements Plugin {
  readonly id = 'broken';
  readonly version = '0.0.1';
  readonly capabilities = ['exporter'] as const;
  activate(): void {
    throw new Error('boom');
  }
}

/** A plugin that registers an exporter and THEN throws — the half-done
 * registration must be rolled back, not committed. */
class HalfPlugin implements Plugin {
  readonly id = 'half';
  readonly version = '0.0.1';
  readonly capabilities = ['exporter'] as const;
  activate(ctx: PluginContext): void {
    ctx.registerExporter({ id: 'ghost', format: 'x', export: () => '' });
    throw new Error('too late');
  }
}

/** A store-policy-violating media importer (YouTube-shaped): desktop/sideload
 * only, never store-safe — must be gated out of the Play build (rule ①.F.20). */
class FakeYouTubePlugin implements Plugin {
  readonly id = 'youtube-importer';
  readonly version = '1.0.0';
  readonly capabilities = ['media-importer'] as const;
  readonly distribution = {
    storeSafe: false,
    platforms: ['desktop', 'sideload'],
  } as const;
  activate(ctx: PluginContext): void {
    const importer: IMediaImporter = {
      id: 'youtube',
      canImport: () => true,
      import: (): Promise<ImportedMedia> =>
        Promise.resolve({ mediaId: 'yt', subtitleTracks: [] }),
    };
    ctx.registerMediaImporter(importer);
  }
}

describe('PluginRegistry', () => {
  it('discovers registered plugins and indexes them by capability', () => {
    const reg = new PluginRegistry()
      .register(new WhisperPlugin())
      .register(new AnkiExporterPlugin());

    expect(reg.discover().map((p) => p.id)).toEqual([
      'whisper-offline',
      'anki-exporter',
    ]);
    expect(reg.get('subtitle-provider').map((p) => p.id)).toEqual([
      'whisper-offline',
    ]);
    expect(reg.get('exporter').map((p) => p.id)).toEqual(['anki-exporter']);
  });

  it('activates plugins and exposes their implementations', async () => {
    const reg = new PluginRegistry()
      .register(new WhisperPlugin())
      .register(new AnkiExporterPlugin());

    const report = await reg.activateAll();
    expect(report.activated).toEqual(['whisper-offline', 'anki-exporter']);
    expect(report.failures).toEqual([]);
    expect(reg.subtitleProviders().map((p) => p.id)).toEqual(['whisper-offline']);
    expect(reg.exporters().map((e) => e.id)).toEqual(['anki']);
  });

  it('isolates a failing plugin without dropping the others', async () => {
    const logs: string[] = [];
    const reg = new PluginRegistry({ logger: (m) => logs.push(m) })
      .register(new BrokenPlugin())
      .register(new WhisperPlugin())
      .register(new AnkiExporterPlugin());

    const report = await reg.activateAll();

    expect(report.activated).toEqual(['whisper-offline', 'anki-exporter']);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.pluginId).toBe('broken');
    expect(report.failures[0]!.error.message).toBe('boom');
    // The healthy plugins still came up.
    expect(reg.subtitleProviders()).toHaveLength(1);
    expect(reg.exporters()).toHaveLength(1);
    expect(logs.some((l) => l.includes('[broken] activate failed'))).toBe(true);
  });

  it('rolls back a plugin that registers then throws', async () => {
    const reg = new PluginRegistry()
      .register(new HalfPlugin())
      .register(new AnkiExporterPlugin());

    const report = await reg.activateAll();

    expect(report.failures.map((f) => f.pluginId)).toEqual(['half']);
    // The ghost exporter from the failed plugin must NOT be committed.
    expect(reg.exporters().map((e) => e.id)).toEqual(['anki']);
  });

  it('gates a non-store-safe plugin out of the Play profile', async () => {
    const reg = new PluginRegistry({ profile: PLAY_PROFILE })
      .register(new FakeYouTubePlugin())
      .register(new WhisperPlugin());

    const report = await reg.activateAll();

    // YouTube importer skipped (never activated); its capability not exposed.
    expect(report.activated).toEqual(['whisper-offline']);
    expect(report.skipped.map((s) => s.pluginId)).toEqual(['youtube-importer']);
    expect(report.skipped[0]!.reason).toContain('play');
    expect(reg.mediaImporters()).toHaveLength(0);
    // The no-meta plugin is unaffected.
    expect(reg.subtitleProviders().map((p) => p.id)).toEqual(['whisper-offline']);
    expect(report.failures).toEqual([]);
  });

  it('activates the same plugin under the desktop profile', async () => {
    const reg = new PluginRegistry({ profile: DESKTOP_PROFILE })
      .register(new FakeYouTubePlugin())
      .register(new WhisperPlugin());

    const report = await reg.activateAll();

    expect(report.activated).toEqual(['youtube-importer', 'whisper-offline']);
    expect(report.skipped).toEqual([]);
    expect(reg.mediaImporters().map((im) => im.id)).toEqual(['youtube']);
  });

  it('lets a per-call profile override the constructor default', async () => {
    const reg = new PluginRegistry({ profile: DESKTOP_PROFILE }).register(
      new FakeYouTubePlugin(),
    );

    const report = await reg.activateAll(PLAY_PROFILE);

    expect(report.activated).toEqual([]);
    expect(report.skipped.map((s) => s.pluginId)).toEqual(['youtube-importer']);
  });

  it('applies no gate when no profile is set (existing behaviour)', async () => {
    const reg = new PluginRegistry().register(new FakeYouTubePlugin());

    const report = await reg.activateAll();

    expect(report.activated).toEqual(['youtube-importer']);
    expect(report.skipped).toEqual([]);
    expect(reg.mediaImporters().map((im) => im.id)).toEqual(['youtube']);
  });
});
