// Classify a media source URI without touching the network (pure). This is the
// headless half of "直接从互联网播放" (streaming playback): the composition root
// uses it to decide whether a source needs the `network` consent gate, and UI
// adapters use it to pick affordances (buffering spinner, offline badge, …).
// Kept in player-api beside `MediaSource` so adapters and the core classify a
// URI identically. No I/O — a string in, a verdict out.

/** Whether a source is fetched over the network or read from local storage. */
export type SourceKind = 'local' | 'remote';

// Schemes that resolve to bytes already on the device. Everything else that
// carries an explicit `scheme://` authority is treated as remote (http/https,
// and streaming transports like rtmp/rtsp), so new remote transports need no
// change here — only genuinely-local schemes are enumerated (OCP).
const LOCAL_SCHEMES: ReadonlySet<string> = new Set(['file', 'content', 'asset']);

// `scheme://` prefix per RFC 3986: an ASCII letter then letters/digits/+/-/. —
// requires the `//` authority so a bare Windows path (`C:\clip.mp4`) or a
// SRT-style timestamp never matches.
const SCHEME_AUTHORITY = /^([a-z][a-z0-9+.-]*):\/\//i;

/**
 * Classify `uri` as `local` or `remote`. Case-insensitive; surrounding
 * whitespace is ignored. A URI with no `scheme://` authority (bare or relative
 * path, including `C:\…` and `/data/…`) is `local`; `file://`, `content://`,
 * and `asset://` are `local`; any other explicit scheme is `remote`.
 */
export const sourceKind = (uri: string): SourceKind => {
  const match = SCHEME_AUTHORITY.exec(uri.trim());
  if (match === null) {
    return 'local';
  }
  return LOCAL_SCHEMES.has(match[1]!.toLowerCase()) ? 'local' : 'remote';
};

/**
 * True when playing `uri` requires the network (and therefore the `network`
 * consent gate). Convenience wrapper over {@link sourceKind}.
 */
export const isRemoteSource = (uri: string): boolean => sourceKind(uri) === 'remote';

/**
 * True when `uri` looks like an HLS playlist (`.m3u8`), ignoring any query or
 * fragment. A hint for adapters that must opt an HLS source into streaming
 * mode; independent of {@link sourceKind} (a playlist can be local or remote).
 */
export const isHlsSource = (uri: string): boolean => {
  const path = uri.trim().split(/[?#]/, 1)[0] ?? '';
  return path.toLowerCase().endsWith('.m3u8');
};
