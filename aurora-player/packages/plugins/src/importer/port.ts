import type { SubtitleDocument } from '@aurora/subtitle';

/**
 * A platform-neutral reference to something importable (plan/04 · capability
 * interfaces · `IMediaImporter`). `uri` identifies the source (a local manifest
 * path, a YouTube URL, …); `content` optionally carries the already-read source
 * bytes so a pure importer never touches the filesystem or network — the
 * composition root reads and injects them (DIP). A real network importer ignores
 * `content` and fetches by `uri` itself.
 */
export interface MediaRef {
  readonly uri: string;
  readonly content?: string;
}

/**
 * The platform-agnostic result of an import: media metadata plus whatever
 * subtitle tracks the source carried, each already normalized to the unified
 * {@link SubtitleDocument} so it can feed the timeline / learning loop unchanged
 * (plan/07 · M5 "external media → subtitles → learning"). Optional fields are
 * omitted when the source does not provide them (ISP — no null padding).
 */
export interface ImportedMedia {
  readonly mediaId: string;
  readonly title?: string;
  readonly durationMs?: number;
  readonly subtitleTracks: readonly SubtitleDocument[];
}

/**
 * Port for a media importer — the OCP seam for "a media reference → media
 * metadata + available subtitle tracks" (a local manifest now, YouTube/yt-dlp
 * later). A new source is a new implementation discovered through the plugin
 * registry; no core code changes. `canImport` lets the host pick the right
 * importer for a ref without a hard-coded `switch (scheme)`.
 */
export interface IMediaImporter {
  readonly id: string;
  canImport(ref: MediaRef): boolean;
  import(ref: MediaRef): Promise<ImportedMedia>;
}
