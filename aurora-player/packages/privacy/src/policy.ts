import { isGranted, type ConsentState, type DataUse } from '@aurora/domain';

/**
 * Pure consent gate (plan/12 · legal-privacy). Complements the build-profile
 * gate (`@aurora/plugins` `isAllowedUnder`, rule ①.F.20): that decides whether a
 * capability may ship in a build; this decides whether the user has permitted a
 * given data use *at runtime*.
 *
 * Same style as `isAllowedUnder`: deterministic input → boolean/array, no clock,
 * no network, no I/O — so the privacy red line becomes a trivially unit-testable
 * decision that holds identically in CI and at runtime.
 */

/**
 * May a capability requiring `required` data uses run under `state`?
 * Permitted only when EVERY required use is granted. An empty requirement list
 * (an offline capability) is always permitted.
 */
export const isPermitted = (
  required: readonly DataUse[],
  state: ConsentState,
): boolean => required.every((use) => isGranted(state, use));

/**
 * The subset of `required` uses that are NOT yet granted, in the given order
 * (duplicates removed). Empty ⇒ {@link isPermitted} is true. Drives friendly
 * "run: aurora consent grant …" hints without leaking the whole state.
 */
export const missingConsent = (
  required: readonly DataUse[],
  state: ConsentState,
): readonly DataUse[] => {
  const missing: DataUse[] = [];
  for (const use of required) {
    if (!isGranted(state, use) && !missing.includes(use)) {
      missing.push(use);
    }
  }
  return missing;
};

/**
 * The data uses an online / third-party capability (online LLM, online
 * dictionary, YouTube import, …) needs consent for. A convenience constant so
 * the gate is declared in one place rather than re-spelled at each call site.
 */
export const ONLINE_DATA_USES: readonly DataUse[] = ['network', 'third-party'];
