import type { LanguageCode } from '../value-objects/language-code.js';

/**
 * A self-describing "learnable media package" (plan · 媒体市场). One package
 * carries **everything needed to play and study** a piece of media: a video
 * source reference, at least one subtitle track, and the metadata a learner
 * browses by. It deliberately holds only *references and summaries* — a video
 * URI, per-track summaries, plain metadata — never bytes, PII, or credentials
 * (rule ①.E): the marketplace ships descriptions, the device fetches the media.
 *
 * Kept in the kernel (zero-dep) because it is shared across player-api (source
 * normalization), storage (catalog adapters) and the apps/CLI — a cross-package
 * value type, so it lives beside the other shared value objects rather than in a
 * single domain package (which no other domain package could import).
 */

/** A reference to the playable video, without the bytes. */
export interface VideoRef {
  /** Where the video is fetched from (local path, `file://`, or a URL). */
  readonly uri: string;
  /** Total length if known up front; a player discovers it otherwise. */
  readonly durationMs?: number;
  /** Spoken language of the video, if declared. */
  readonly language?: LanguageCode | string;
}

/**
 * A summary of one subtitle track in the package — enough to validate and to
 * pick a track, without embedding the full parsed document (that stays in
 * `@aurora/subtitle`). `hasWordTimings` mirrors `SubtitleDocument.hasWordTimings`
 * so word-level study (史诗 A) can be offered or gracefully degraded.
 */
export interface SubtitleTrackRef {
  readonly language?: LanguageCode | string;
  /** Source format id, e.g. `srt`, `vtt`, `whisperx`. */
  readonly format?: string;
  /** True when at least one line carries word-level timings. */
  readonly hasWordTimings: boolean;
  /**
   * Where the subtitle document is fetched from (a URL). Optional and additive:
   * packages without it behave exactly as before; when present, a player can
   * fetch and parse the track (e.g. a server-produced `.whisperx.json`) so
   * marketplace packages play with real subtitles rather than an empty document.
   */
  readonly uri?: string;
}

/** What a learner browses and filters by in the marketplace. */
export interface MediaMeta {
  readonly title: string;
  /** Language spoken in the media. */
  readonly sourceLang: LanguageCode | string;
  /** Language the learner is studying it in. */
  readonly learningLang: LanguageCode | string;
  /** Duration for listings; falls back to {@link VideoRef.durationMs}. */
  readonly durationMs?: number;
}

/** A complete, self-contained learnable media package. */
export interface MediaPackage {
  readonly id: string;
  readonly video: VideoRef;
  readonly subtitles: readonly SubtitleTrackRef[];
  readonly meta: MediaMeta;
}

/** A lightweight catalog-listing view derived from a {@link MediaPackage}. */
export interface MediaPackageSummary {
  readonly id: string;
  readonly title: string;
  readonly sourceLang: LanguageCode | string;
  readonly learningLang: LanguageCode | string;
  readonly durationMs?: number;
  /** True when any subtitle track carries word-level timings. */
  readonly hasWordTimings: boolean;
}

/**
 * The playback/learning elements a package can be missing. Errors block upload
 * (the media cannot be played/studied); warnings are degradations a learner can
 * still use (e.g. no word timings → word-step falls back to estimates).
 */
export type MissingRequirement =
  | 'video-source'
  | 'subtitle-track'
  | 'word-timings'
  | 'title'
  | 'source-language'
  | 'learning-language'
  | 'duration';

export type IssueSeverity = 'error' | 'warning';

export interface MediaPackageIssue {
  readonly requirement: MissingRequirement;
  readonly severity: IssueSeverity;
  readonly message: string;
}

/**
 * The verdict of {@link validateMediaPackage}. `ok` is true iff there are no
 * `errors`; `warnings` never affect `ok` (they surface degraded, still-usable
 * packages).
 */
export interface MediaPackageValidation {
  readonly ok: boolean;
  readonly errors: readonly MediaPackageIssue[];
  readonly warnings: readonly MediaPackageIssue[];
}

const isBlank = (value: string | undefined): boolean =>
  value === undefined || value.trim() === '';

/**
 * Check that a package carries every element needed to play and study it — the
 * headless, testable gate behind "上传必须自带播放全要素" (plan · 媒体市场 C3).
 *
 * Pure and defensive: it tolerates a malformed (untrusted, just-uploaded)
 * object shape, so a caller can validate *before* trusting it. Errors block an
 * upload; warnings (`word-timings`, `duration`) mark a usable-but-degraded
 * package.
 */
export const validateMediaPackage = (
  pkg: MediaPackage,
): MediaPackageValidation => {
  const errors: MediaPackageIssue[] = [];
  const warnings: MediaPackageIssue[] = [];
  const fail = (requirement: MissingRequirement, message: string): void => {
    errors.push({ requirement, severity: 'error', message });
  };
  const warn = (requirement: MissingRequirement, message: string): void => {
    warnings.push({ requirement, severity: 'warning', message });
  };

  const video = pkg.video as VideoRef | undefined;
  const meta = pkg.meta as MediaMeta | undefined;
  const subtitles = pkg.subtitles ?? [];

  if (isBlank(video?.uri)) {
    fail('video-source', 'Package has no playable video source.');
  }

  if (subtitles.length === 0) {
    fail('subtitle-track', 'Package needs at least one subtitle track.');
  } else if (!subtitles.some((track) => track.hasWordTimings)) {
    warn(
      'word-timings',
      'No subtitle track carries word-level timings; word-step study falls back to estimates.',
    );
  }

  if (isBlank(meta?.title)) {
    fail('title', 'Package metadata is missing a title.');
  }
  if (isBlank(meta?.sourceLang as string | undefined)) {
    fail('source-language', 'Package metadata is missing the source language.');
  }
  if (isBlank(meta?.learningLang as string | undefined)) {
    fail(
      'learning-language',
      'Package metadata is missing the learning language.',
    );
  }

  if (video?.durationMs === undefined && meta?.durationMs === undefined) {
    warn('duration', 'Duration is unknown; a player will discover it on open.');
  }

  return { ok: errors.length === 0, errors, warnings };
};

/** Derive the catalog-listing view from a full {@link MediaPackage}. */
export const summarizeMediaPackage = (
  pkg: MediaPackage,
): MediaPackageSummary => {
  const durationMs = pkg.video.durationMs ?? pkg.meta.durationMs;
  return {
    id: pkg.id,
    title: pkg.meta.title,
    sourceLang: pkg.meta.sourceLang,
    learningLang: pkg.meta.learningLang,
    ...(durationMs !== undefined ? { durationMs } : {}),
    hasWordTimings: pkg.subtitles.some((track) => track.hasWordTimings),
  };
};
