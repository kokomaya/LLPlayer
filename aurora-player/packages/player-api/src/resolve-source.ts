import type { MediaPackage } from '@aurora/domain';
import type { MediaSource } from './model.js';
import { isRemoteSource } from './source-kind.js';

/**
 * The three ways a learner picks something to play (plan · 媒体市场 C2): a raw
 * URI they typed or picked (a local file **or** a URL), or a full
 * {@link MediaPackage} chosen from the marketplace. Local and URL sources play
 * **without any upload** — they normalize straight to a {@link MediaSource} and
 * flow through the ordinary playback path (史诗 A).
 */
export type SourceInput =
  | { readonly kind: 'uri'; readonly uri: string; readonly title?: string; readonly durationMs?: number }
  | { readonly kind: 'package'; readonly pkg: MediaPackage };

/**
 * Normalize any {@link SourceInput} into the single {@link MediaSource} the
 * player opens. Pure — no I/O, no upload, no network. A package's `id` and
 * metadata carry over so events and the UI stay consistent with the catalog
 * entry; a raw URI gets a stable derived id.
 */
export const resolveMediaSource = (input: SourceInput): MediaSource => {
  if (input.kind === 'package') {
    const { pkg } = input;
    const durationMs = pkg.video.durationMs ?? pkg.meta.durationMs;
    return {
      id: pkg.id,
      uri: pkg.video.uri,
      title: pkg.meta.title,
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  }
  return {
    id: `uri:${input.uri}`,
    uri: input.uri,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  };
};

/**
 * Whether opening this source will hit the network — and therefore whether the
 * composition root must first pass the `network` consent gate (rule ①.F.22,
 * `isPermitted(['network'], state)`). A local file or local-scheme package needs
 * no consent; a URL (or a package whose video is a URL) does. Pure: it only
 * classifies the resolved URI via {@link isRemoteSource}, it does not fetch.
 */
export const requiresNetworkConsent = (input: SourceInput): boolean =>
  isRemoteSource(resolveMediaSource(input).uri);
