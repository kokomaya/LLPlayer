import {
  isHlsSource,
  isRemoteSource,
  type SourceInput,
} from '@aurora/player-api';

// Headless "Stream Online Videos" entry point (Epic A · aligns with SubX's
// direct-URL playback). The learner types/pastes a URL on the home screen; this
// pure function validates it and normalizes it into the same {@link SourceInput}
// the rest of the pipeline already understands, so a URL flows through the exact
// consent gate (`decidePlayback`) and player path as any other source. No I/O,
// no network — a string in, a verdict out — so the "is this a playable URL"
// rule stays identical in CI and on device.

/** A rejected parse, with a machine-readable reason the UI can localize. */
export type UrlSourceError =
  | { readonly ok: false; readonly reason: 'empty' }
  | { readonly ok: false; readonly reason: 'not-a-url' };

/** A successful parse: the URL normalized into a ready-to-gate `SourceInput`. */
export interface UrlSourceOk {
  readonly ok: true;
  readonly input: Extract<SourceInput, { kind: 'uri' }>;
  /** True when the URL looks like an HLS playlist (`.m3u8`) — a UI hint. */
  readonly hls: boolean;
}

export type UrlSourceResult = UrlSourceOk | UrlSourceError;

/**
 * Derive a human-friendly default title from a URL: the last non-empty path
 * segment (decoded), stripped of any query/fragment; falls back to the host, or
 * the trimmed URL itself. Pure and defensive — never throws on odd input.
 */
export const titleFromUrl = (uri: string): string => {
  const trimmed = uri.trim();
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? trimmed;
  const afterScheme = withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const segments = afterScheme.split('/').filter((s) => s.length > 0);
  const last = segments[segments.length - 1];
  const candidate = segments.length > 1 && last ? last : segments[0];
  if (!candidate) {
    return trimmed;
  }
  try {
    return decodeURIComponent(candidate);
  } catch {
    return candidate;
  }
};

/**
 * Validate and normalize a typed/pasted URL into a {@link SourceInput}. Accepts
 * any remote scheme (`http`/`https` and streaming transports like `rtmp`/`rtsp`,
 * plus `.m3u8` HLS over those); rejects an empty string and anything without a
 * `scheme://` authority (a bare/local path — those come from the file picker,
 * not this URL field). An optional `title` overrides the derived default.
 */
export const parseUrlSource = (
  text: string,
  title?: string,
): UrlSourceResult => {
  const uri = text.trim();
  if (uri.length === 0) {
    return { ok: false, reason: 'empty' };
  }
  if (!isRemoteSource(uri)) {
    return { ok: false, reason: 'not-a-url' };
  }
  const resolvedTitle = title?.trim() ? title.trim() : titleFromUrl(uri);
  return {
    ok: true,
    hls: isHlsSource(uri),
    input: { kind: 'uri', uri, title: resolvedTitle },
  };
};
