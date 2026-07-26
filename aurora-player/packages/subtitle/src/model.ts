import type { LanguageCode, TimeRange } from '@aurora/domain';

/**
 * The unified subtitle model (plan/05 · subtitle). Every parser produces a
 * {@link SubtitleDocument}; downstream packages (timeline, dictionary, ai,
 * learning) only ever see this shape — never a raw file format.
 */
export interface Word {
  readonly text: string;
  readonly lemma?: string;
  /** Present only when the source carries word-level timings (e.g. WhisperX). */
  readonly range?: TimeRange;
}

export interface SubtitleLine {
  readonly id: string;
  readonly range: TimeRange;
  /** Cleaned cue text; internal line breaks preserved. */
  readonly text: string;
  readonly words?: readonly Word[];
  readonly translated?: string;
}

export interface SubMeta {
  /** Source format id, e.g. `srt`, `vtt`. */
  readonly format: string;
  readonly language?: LanguageCode | string;
  readonly title?: string;
}

export interface SubtitleDocument {
  readonly lines: readonly SubtitleLine[];
  readonly meta: SubMeta;
  /** True when at least one line carries word-level timings. */
  readonly hasWordTimings: boolean;
}
