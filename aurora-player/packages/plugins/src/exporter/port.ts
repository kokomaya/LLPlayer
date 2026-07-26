import type { ReviewCard, VocabEntry } from '@aurora/domain';

/**
 * The data an exporter turns into a shareable artifact (plan/05 · plugins ·
 * `IExporter`). Passing plain records (not a repository) keeps every exporter a
 * pure, synchronous function — trivially testable and platform-free. The
 * composition root reads the {@link VocabularyRepository}/{@link ReviewRepository}
 * and hands the rows in; the exporter never touches storage or the clock.
 */
export interface ExportInput {
  readonly entries: readonly VocabEntry[];
  /** Optional review state, keyed by `vocabId`, for schedule-aware formats. */
  readonly cards?: readonly ReviewCard[];
}

/**
 * Port for a study-material exporter — the OCP seam for "saved vocabulary →
 * external tool" (Anki now, CSV/Quizlet/… later). A new target is a new
 * implementation of this one port, discovered through the plugin registry; no
 * core code changes.
 */
export interface IExporter {
  readonly id: string;
  /** Human/tool-facing artifact format, e.g. `anki-tsv`. */
  readonly format: string;
  export(input: ExportInput): string;
}
