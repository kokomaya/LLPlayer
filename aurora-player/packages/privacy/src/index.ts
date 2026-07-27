// @aurora/privacy: pure consent policy for data governance (plan/12 · legal).
// The consent value model + repository port live in the kernel (@aurora/domain);
// this package owns the *decision* (isPermitted/missingConsent), its contract,
// the consent-gated telemetry decorator that reuses that decision to make
// analytics opt-in, and the data-subject service (export/erase) that coordinates
// the kernel repository ports. Zero platform/network deps — headless (①.A.3).

export { isPermitted, missingConsent, ONLINE_DATA_USES } from './policy.js';

export {
  ConsentGatedTelemetry,
  TELEMETRY_DATA_USES,
} from './telemetry/consent-gated-telemetry.js';
export { InMemoryTelemetrySink } from './telemetry/in-memory-telemetry-sink.js';

export {
  DataSubjectService,
  type DataSubjectRepositories,
} from './dsar/data-subject-service.js';
export {
  isSupportedVersion,
  UnsupportedSnapshotVersionError,
  type DataImportOptions,
  type DataImportReport,
} from './dsar/import.js';

export {
  RetentionService,
  type RetentionRepositories,
  type PruneOptions,
} from './retention/retention-service.js';
export type { RetentionPolicy, RetentionReport } from './retention/policy.js';

// Data-processing transparency (plan/12 · Art.13/14 disclosure + Art.30 record
// of processing): a pure static manifest + predicates that prove every gated
// data use is disclosed (purpose limitation). Metadata only — no PII/credentials.
export {
  disclosedUses,
  disclosureFor,
  isFullyDisclosed,
  missingDisclosures,
  undisclosedUses,
  type ProcessingManifest,
  type ProcessingRecord,
} from './disclosure/manifest.js';
export { DEFAULT_PROCESSING_MANIFEST } from './disclosure/default-manifest.js';
