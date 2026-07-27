import { DATA_USES, type DataUse } from '@aurora/domain';

/**
 * Data-processing transparency (plan/12 · GDPR Art.13/14 disclosure + Art.30
 * record of processing). The runtime consent gate (`isPermitted`, ①.F.22)
 * decides *whether* a capability may run; this module records *what* each
 * capability does with data and *why*, so the app can show an honest data-use
 * disclosure and prove the "purpose limitation" red line: every data use the
 * gate ever requires must be declared here.
 *
 * Pure static metadata + pure predicates — no clock, no I/O, kernel-only dep
 * (①.A.3). A record holds "capability ↔ uses ↔ purpose ↔ retention" ONLY: never
 * PII, never a credential, never a backend endpoint (①.E).
 */

/** One capability's processing declaration. */
export interface ProcessingRecord {
  /** Stable capability id, e.g. `streaming-playback`, `online-dictionary`. */
  readonly capability: string;
  /** The data uses this capability performs (⊆ the consent taxonomy). */
  readonly uses: readonly DataUse[];
  /** Plain-language purpose shown to the user (Art.13/14). */
  readonly purpose: string;
  /** How long related data is kept, if any is retained at all. Omit ⇒ nothing retained. */
  readonly retentionDays?: number;
}

/** An ordered set of processing declarations. */
export type ProcessingManifest = readonly ProcessingRecord[];

/**
 * The distinct data uses declared anywhere in the manifest, returned in the
 * canonical {@link DATA_USES} order (deduped). This is the manifest's total
 * "disclosure surface".
 */
export const disclosedUses = (
  manifest: ProcessingManifest,
): readonly DataUse[] => {
  const declared = new Set<DataUse>(manifest.flatMap((r) => r.uses));
  return DATA_USES.filter((use) => declared.has(use));
};

/** The record for `capability`, or `undefined` if it is not declared. */
export const disclosureFor = (
  manifest: ProcessingManifest,
  capability: string,
): ProcessingRecord | undefined =>
  manifest.find((r) => r.capability === capability);

/**
 * Of the `required` data uses (typically what a gate enforces), those the
 * manifest declares NOWHERE. Order of `required` is preserved, duplicates
 * removed. Empty ⇒ every required use is disclosed.
 */
export const undisclosedUses = (
  manifest: ProcessingManifest,
  required: readonly DataUse[],
): readonly DataUse[] => {
  const declared = new Set(disclosedUses(manifest));
  const out: DataUse[] = [];
  for (const use of required) {
    if (!declared.has(use) && !out.includes(use)) out.push(use);
  }
  return out;
};

/** True when every use in `required` is declared somewhere in the manifest. */
export const isFullyDisclosed = (
  manifest: ProcessingManifest,
  required: readonly DataUse[],
): boolean => undisclosedUses(manifest, required).length === 0;

/**
 * Of the WHOLE consent taxonomy ({@link DATA_USES}), the uses this manifest is
 * silent about. A whole-manifest health check: `[]` means the manifest covers
 * every category the app can gate on. (A use nothing gates may legitimately be
 * absent — purpose limitation is one-directional: disclose what you gate.)
 */
export const missingDisclosures = (
  manifest: ProcessingManifest,
): readonly DataUse[] => undisclosedUses(manifest, DATA_USES);
