import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import type { IMediaImporter, ImportedMedia, MediaRef } from './port.js';
import type { Plugin, PluginContext } from '../plugin.js';

/** One embedded subtitle track in a manifest: raw cue text + optional filename
 * (used for format detection by the subtitle parser registry). */
interface ManifestSubtitle {
  readonly filename?: string;
  readonly content: string;
}

interface Manifest {
  readonly mediaId: string;
  readonly title?: string;
  readonly durationMs?: number;
  readonly subtitles: readonly ManifestSubtitle[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`manifest: "${field}" must be a non-empty string`);
  }
  return value;
};

/** Validate an untrusted JSON payload into a {@link Manifest} (fail loud). */
const parseManifest = (json: string): Manifest => {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (cause) {
    throw new Error(`manifest: invalid JSON (${(cause as Error).message})`);
  }
  if (!isRecord(raw)) {
    throw new Error('manifest: expected a JSON object');
  }
  const mediaId = asString(raw.mediaId, 'mediaId');
  const subsRaw = raw.subtitles;
  if (!Array.isArray(subsRaw)) {
    throw new Error('manifest: "subtitles" must be an array');
  }
  const subtitles = subsRaw.map((sub, i): ManifestSubtitle => {
    if (!isRecord(sub)) {
      throw new Error(`manifest: subtitles[${i}] must be an object`);
    }
    const content = asString(sub.content, `subtitles[${i}].content`);
    return typeof sub.filename === 'string'
      ? { filename: sub.filename, content }
      : { content };
  });
  return {
    mediaId,
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(typeof raw.durationMs === 'number' ? { durationMs: raw.durationMs } : {}),
    subtitles,
  };
};

/**
 * Offline {@link IMediaImporter}: turns a local JSON manifest (media metadata +
 * inline subtitle cue text) into an {@link ImportedMedia}. Pure and
 * deterministic — it reuses the subtitle {@link createDefaultRegistry} to parse
 * each embedded track (srt/vtt/…) into the unified {@link SubtitleDocument}, with
 * no filesystem, network, model, or clock. The composition root reads the file
 * and injects its bytes as {@link MediaRef.content} (DIP). The real
 * network-backed source lives in `youtube-importer.example.ts`.
 */
export class ManifestMediaImporter implements IMediaImporter {
  readonly id = 'manifest';

  canImport(ref: MediaRef): boolean {
    return ref.uri.toLowerCase().endsWith('.json');
  }

  async import(ref: MediaRef): Promise<ImportedMedia> {
    if (ref.content === undefined) {
      throw new Error('manifest importer requires inline manifest content');
    }
    const manifest = parseManifest(ref.content);
    const registry = createDefaultRegistry();
    const subtitleTracks: SubtitleDocument[] = manifest.subtitles.map(
      (sub, i) => {
        const parsed = registry.parse(
          sub.filename !== undefined
            ? { content: sub.content, filename: sub.filename }
            : { content: sub.content },
        );
        if (!parsed.ok) {
          throw new Error(
            `manifest: subtitles[${i}] parse failed: ${parsed.error.message}`,
          );
        }
        return parsed.value;
      },
    );
    return {
      mediaId: manifest.mediaId,
      ...(manifest.title !== undefined ? { title: manifest.title } : {}),
      ...(manifest.durationMs !== undefined
        ? { durationMs: manifest.durationMs }
        : {}),
      subtitleTracks,
    };
  }
}

/**
 * Plugin wrapper contributing the {@link ManifestMediaImporter} under the
 * `media-importer` capability. Activation is I/O-free, so it cannot fail — but it
 * still goes through the registry's isolated activation like any other plugin.
 */
export class MediaImporterPlugin implements Plugin {
  readonly id = 'manifest-importer';
  readonly version = '1.0.0';
  readonly capabilities = ['media-importer'] as const;

  activate(ctx: PluginContext): void {
    ctx.registerMediaImporter(new ManifestMediaImporter());
    ctx.log('registered manifest media importer');
  }
}
