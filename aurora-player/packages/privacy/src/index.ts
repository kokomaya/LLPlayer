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
