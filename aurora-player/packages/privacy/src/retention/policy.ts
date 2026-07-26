// @aurora/privacy · retention model (plan/12 · legal-privacy: storage limitation).
// Pure types + one predicate. No I/O, no clock — the caller injects `now`, so a
// prune pass is fully deterministic given its inputs.

/**
 * The single retention knob: user learning data older than `maxAgeMs` is past the
 * window and eligible for automatic pruning. Injected as a policy decision, never
 * hardcoded — different jurisdictions / user settings pick different windows.
 */
export interface RetentionPolicy {
  readonly maxAgeMs: number;
}

/**
 * Outcome of a prune pass. Deterministic given the inputs: `cutoff` is the
 * boundary instant (`now - maxAgeMs`) and the id lists are exactly what was — or,
 * under dry-run, would be — removed. Carries only ids and counts, never record
 * contents, and never anything outside the user's own learning data (rule ①.E).
 */
export interface RetentionReport {
  /** now - maxAgeMs: vocab created at or before this instant is expired. */
  readonly cutoff: number;
  readonly deletedVocab: readonly string[];
  /** Review cards removed because their parent word expired (orphan cleanup). */
  readonly deletedReviews: readonly string[];
  readonly retainedVocab: number;
  /** True when the pass was a preview and nothing was actually deleted. */
  readonly dryRun: boolean;
}

/**
 * A record is expired when it was created at or before the cutoff. The boundary
 * is inclusive (`<=`): a word created exactly `maxAgeMs` ago is eligible.
 */
export const isExpired = (createdAt: number, cutoff: number): boolean =>
  createdAt <= cutoff;
