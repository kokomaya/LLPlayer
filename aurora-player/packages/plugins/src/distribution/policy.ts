import type { DistributionMeta, Platform } from '../plugin.js';

/**
 * A concrete build target the host is assembling for (plan/12 · legal & privacy).
 * `platform` is the store/OS the build targets; `allowSideload` relaxes the
 * store-safety rule for a build that intentionally permits non-store-safe
 * capabilities (e.g. a Play build variant that also ships side-loaded extras).
 */
export interface DistributionProfile {
  readonly platform: Platform;
  readonly allowSideload?: boolean;
}

/** Platforms whose stores forbid policy-violating capabilities by default. */
const STORE_CONSTRAINED: readonly Platform[] = ['play', 'ios'];

/**
 * Pure build-profile gate: may a plugin with `meta` ship under `profile`?
 * (rule ①.F.20 — turns "YouTube excluded from Play" into a *testable* decision.)
 *
 * Rules, in order:
 *  1. No metadata ⇒ ships everywhere (the bundled offline plugins).
 *  2. `platforms` set and it does NOT include `profile.platform` ⇒ excluded.
 *  3. `storeSafe === false` on a store-constrained profile (unless the profile
 *     opts into side-loading) ⇒ excluded.
 *  4. Otherwise ⇒ allowed.
 *
 * Deterministic input→boolean: no clock, no platform/build library, no I/O — so
 * it is trivially unit-testable and the same decision holds in CI as at runtime.
 */
export const isAllowedUnder = (
  meta: DistributionMeta | undefined,
  profile: DistributionProfile,
): boolean => {
  if (meta === undefined) {
    return true;
  }
  if (
    meta.platforms !== undefined &&
    !meta.platforms.includes(profile.platform)
  ) {
    return false;
  }
  if (meta.storeSafe === false) {
    const constrained =
      STORE_CONSTRAINED.includes(profile.platform) &&
      profile.allowSideload !== true;
    if (constrained) {
      return false;
    }
  }
  return true;
};

/** Human-readable reason a plugin is excluded (used by the registry/CLI). */
export const exclusionReason = (
  meta: DistributionMeta | undefined,
  profile: DistributionProfile,
): string => {
  if (meta?.platforms !== undefined && !meta.platforms.includes(profile.platform)) {
    return `not distributed on '${profile.platform}' (ships on: ${meta.platforms.join(', ')})`;
  }
  return `store policy: not safe for the '${profile.platform}' build`;
};

/** Convenience profiles for the common build targets. */
export const PLAY_PROFILE: DistributionProfile = { platform: 'play' };
export const IOS_PROFILE: DistributionProfile = { platform: 'ios' };
export const DESKTOP_PROFILE: DistributionProfile = { platform: 'desktop' };
export const SIDELOAD_PROFILE: DistributionProfile = { platform: 'sideload' };
