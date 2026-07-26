import { DATA_EXPORT_VERSION } from '@aurora/domain';

/**
 * Options for {@link DataSubjectService.import} (plan/12 · data portability).
 * The default (merge) is deliberately non-destructive: it upserts the snapshot
 * over whatever is already stored. `replace` opts into wiping local data first,
 * so the snapshot becomes the whole store — never the default, to avoid an
 * accidental erase.
 */
export interface DataImportOptions {
  readonly replace?: boolean;
}

/**
 * The outcome of importing a {@link DataExport} — counts only, so it carries no
 * PII and is cheap to print. `replaced` records whether local data was erased
 * first. There is no field here for anything outside the user's own data (rule
 * ①.E): import only ever writes vocab / reviews / consent.
 */
export interface DataImportReport {
  /** Schema version of the snapshot that was imported. */
  readonly version: number;
  readonly importedVocab: number;
  readonly importedReviews: number;
  readonly importedConsent: number;
  /** True when `replace` erased local data before writing the snapshot. */
  readonly replaced: boolean;
}

/**
 * True when this build can import a snapshot at `version`. Only the current
 * {@link DATA_EXPORT_VERSION} is accepted; older/newer exports are rejected
 * rather than silently mis-read, leaving room for a future migration step.
 */
export const isSupportedVersion = (version: number): boolean =>
  version === DATA_EXPORT_VERSION;

/**
 * Thrown when a snapshot's `version` is not importable by this build. Catchable
 * at the CLI boundary, where it becomes a friendly error + non-zero exit code.
 */
export class UnsupportedSnapshotVersionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(
      `unsupported snapshot version ${version} (expected ${DATA_EXPORT_VERSION})`,
    );
    this.name = 'UnsupportedSnapshotVersionError';
    this.version = version;
  }
}
