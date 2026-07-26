/**
 * Consent value model for privacy & data governance (plan/12 · legal-privacy).
 *
 * Hosted in the KERNEL on purpose: consent is a cross-cutting concern that the
 * policy package (`@aurora/privacy`, which *decides* on it), the storage package
 * (adapters that *persist* it), and the composition roots (that *gate* on it)
 * all share. A domain package may depend only on the kernel, never on another
 * domain package (plan/03 §3), so hosting the value types + port here lets every
 * side depend on one shared abstraction (DIP) — exactly as the learning
 * repositories and the AI `CacheRepository` do.
 *
 * Everything here is pure data + pure transforms: no clock, no I/O. Timestamps
 * are epoch-ms `number`s supplied by the caller's injected clock (never
 * `Date.now()`), the same unit the cache uses, so consent history is
 * deterministic under a `ManualClock` (plan/09 · determinism).
 */

/**
 * A category of data use that requires the user's explicit consent before a
 * capability may run. Offline capabilities need none (`required = []`).
 *  - `network`      — makes outbound network requests.
 *  - `third-party`  — sends data to / fetches from a third-party service.
 *  - `pii`          — processes personally identifiable information.
 *  - `telemetry`    — reports anonymous usage analytics (opt-in).
 */
export type DataUse = 'network' | 'third-party' | 'pii' | 'telemetry';

/** All data-use categories, in a stable order (for `consent show`, tests). */
export const DATA_USES: readonly DataUse[] = [
  'network',
  'third-party',
  'pii',
  'telemetry',
];

/** Narrowing guard for a raw string coming off the CLI / storage. */
export const isDataUse = (value: string): value is DataUse =>
  (DATA_USES as readonly string[]).includes(value);

/**
 * One consent decision for a single {@link DataUse}. `at` is the epoch-ms
 * timestamp the decision was recorded, supplied by an injected clock so the
 * audit trail is deterministic (never a wall clock).
 */
export interface ConsentRecord {
  readonly use: DataUse;
  readonly granted: boolean;
  readonly at: number;
}

/**
 * The user's current consent, keyed by data use. A category with no record is
 * treated as *not granted* (privacy-safe default, ISP rule ①.B.8): absence never
 * means permission. Immutable — {@link withConsent} returns a new state.
 */
export type ConsentState = ReadonlyMap<DataUse, ConsentRecord>;

/** An empty consent state: nothing granted yet. */
export const emptyConsent = (): ConsentState =>
  new Map<DataUse, ConsentRecord>();

/**
 * Return a new state with `use` set to `granted`, stamped `at`. Pure: the input
 * state is untouched. Latest decision for a use wins.
 */
export const withConsent = (
  state: ConsentState,
  use: DataUse,
  granted: boolean,
  at: number,
): ConsentState => {
  const next = new Map(state);
  next.set(use, { use, granted, at });
  return next;
};

/** True only when `use` has an explicit granted record; absence ⇒ false. */
export const isGranted = (state: ConsentState, use: DataUse): boolean =>
  state.get(use)?.granted === true;
