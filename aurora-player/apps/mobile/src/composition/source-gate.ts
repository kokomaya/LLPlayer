import type { ConsentState, DataUse } from '@aurora/domain';
import {
  requiresNetworkConsent,
  resolveMediaSource,
  type MediaSource,
  type SourceInput,
} from '@aurora/player-api';
import { missingConsent } from '@aurora/privacy';

// Headless consent gate for source selection (Epic A/C · plan/12 rule ①.F.22).
// A learner picks something to play — a local file, a typed URL, or a
// marketplace package. Local sources play offline; anything that streams over
// the network must first pass the `network` consent gate. This module decides
// *whether* a chosen source may open and, when it may not, *what consent is
// missing* — so the device UI can prompt "grant network access" instead of
// silently failing. It reuses the canonical `missingConsent` gate (never
// re-implements it) and the pure `resolveMediaSource`; no I/O, no clock, so the
// online red line stays a Node-testable decision identical in CI and at runtime.

/**
 * The consent a streaming source needs. Deliberately just `network` — direct
 * playback of a URL is a first-party fetch, not a third-party disclosure (unlike
 * the online dictionary/AI, which additionally need `third-party`). Mirrors the
 * `streaming-playback` row of the data-processing disclosure manifest.
 */
export const STREAMING_DATA_USES: readonly DataUse[] = ['network'];

/**
 * The outcome of choosing a source: either it is cleared to open (with the
 * resolved {@link MediaSource} ready for the player), or it is blocked pending
 * the listed consent grants.
 */
export type PlaybackDecision =
  | { readonly ready: true; readonly media: MediaSource }
  | { readonly ready: false; readonly missing: readonly DataUse[] };

/**
 * Decide whether `input` may play under `consent`. An offline source (local
 * file / local-scheme package) is always ready; a streaming source is ready only
 * once `network` is granted, otherwise it reports the missing consent for the UI
 * to request. Pure — classifies and resolves, never fetches.
 */
export const decidePlayback = (
  input: SourceInput,
  consent: ConsentState,
): PlaybackDecision => {
  const required = requiresNetworkConsent(input) ? STREAMING_DATA_USES : [];
  const missing = missingConsent(required, consent);
  if (missing.length > 0) {
    return { ready: false, missing };
  }
  return { ready: true, media: resolveMediaSource(input) };
};
