import type { ConsentRecord } from '../privacy/consent.js';
import type { ReviewCard, VocabEntry } from '../learning/cards.js';

/**
 * Data-subject export model (plan/12 · legal-privacy: data portability & the
 * right of access). A portable snapshot of everything the user has produced —
 * their saved vocabulary, review schedule, and consent decisions — and nothing
 * else.
 *
 * Hosted in the KERNEL on purpose: the aggregator (`@aurora/privacy`) that
 * *builds* it and the composition roots / CLI that *serialize* it all share the
 * shape, while every field is an existing kernel value type. There is
 * deliberately no place here for secrets, API keys, model paths, or a telemetry
 * backend DSN (rule ①.E) — data minimization is enforced structurally: the type
 * simply has no field to carry them.
 *
 * `exportedAt` is an injected epoch-ms timestamp (never `Date.now()`), so a
 * snapshot is byte-for-byte reproducible under a `ManualClock` (rule ①.C.13).
 * Every field is JSON-serializable, so a caller can persist the snapshot with a
 * plain `JSON.stringify`.
 */
export interface DataExport {
  /** Schema version of this snapshot, so an importer can migrate old exports. */
  readonly version: number;
  /** Epoch-ms the snapshot was taken, from the caller's injected clock. */
  readonly exportedAt: number;
  readonly vocab: readonly VocabEntry[];
  readonly reviews: readonly ReviewCard[];
  readonly consent: readonly ConsentRecord[];
}

/** Current {@link DataExport} schema version. Bump when the shape changes. */
export const DATA_EXPORT_VERSION = 1;

/** The user-data parts of a {@link DataExport}, before version/time stamping. */
export interface DataExportParts {
  readonly vocab: readonly VocabEntry[];
  readonly reviews: readonly ReviewCard[];
  readonly consent: readonly ConsentRecord[];
}

/**
 * Assemble a {@link DataExport} from the user's data, stamping the current
 * {@link DATA_EXPORT_VERSION} and the injected `exportedAt`. Pure: it copies no
 * clock and performs no I/O — the single place the version is applied, so
 * producers never hardcode it.
 */
export const dataExport = (
  exportedAt: number,
  parts: DataExportParts,
): DataExport => ({
  version: DATA_EXPORT_VERSION,
  exportedAt,
  vocab: parts.vocab,
  reviews: parts.reviews,
  consent: parts.consent,
});
