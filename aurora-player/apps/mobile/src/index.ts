//
// Public surface of the mobile app's testable core (plan/05 · apps/mobile).
//
// Everything exported here is pure TypeScript — no React, no react-native, no
// react-native-video — so it typechecks and runs in Node under Vitest. The
// actual native bindings live in `src/ui/*.example.tsx` (excluded from the
// build/test/lint graph; wired only on device — see README.md).
//

// Composition root — the single place platform wiring is assembled.
export {
  createPlayerRuntime,
  type PlayerRuntime,
  type PlayerRuntimeDeps,
} from './composition/player-runtime.js';

// Epic A learning gestures (word-step seek + subtitle copy). Headless so the
// device UI stays a thin button layer; also reachable via `runtime.controls`.
export {
  createLearningControls,
  type LearningControls,
} from './composition/learning-controls.js';

// Epic A transport bar brain: play/pause · seek · progress · time, derived from
// the IPlayer port so the device chrome stays a thin control layer. Also reachable
// via `runtime.transport`. `formatClock` renders the time labels.
export {
  createTransportControls,
  formatClock,
  type TransportControls,
  type TransportState,
} from './composition/transport-controls.js';

// Epic A/C source-selection consent gate: decide whether a local/URL/package
// pick may play, and what `network` consent is missing if not. Reuses the
// canonical privacy gate — no logic re-implemented in the UI.
export {
  STREAMING_DATA_USES,
  decidePlayback,
  type PlaybackDecision,
} from './composition/source-gate.js';

// Epic A "Stream Online Videos": validate/normalize a typed URL into a
// `SourceInput` (then gated by `decidePlayback`), and remember it in a
// history/favorites list. Pure logic; the device persists via `expo-file-system`.
export {
  parseUrlSource,
  titleFromUrl,
  type UrlSourceError,
  type UrlSourceOk,
  type UrlSourceResult,
} from './composition/url-source.js';
export {
  RECENT_SOURCES_CAP,
  createRecentSources,
  mapRecent,
  upsertRecent,
  type RecentSource,
  type RecentSources,
  type RecentSourcesDeps,
  type RecentSourcesStore,
} from './composition/recent-sources.js';

// Epic C marketplace controller: browse / detail / consent-gated play / upload
// over the ICatalogBackend port. Headless so the store screen stays a thin
// list+button layer; the concrete HTTP backend is injected on device.
export {
  createMarketplaceControls,
  type MarketplaceControls,
  type PackagePlayback,
} from './composition/marketplace-controls.js';

// Epic C local/demo catalog backend: a seedable, in-memory ICatalogBackend so
// the MarketScreen browses without an HTTP server. Same port contract as the
// real backend — swap `HttpCatalogBackend` in at the composition root, no UI change.
export { createSeededCatalog } from './composition/demo-catalog.js';

// Epic C live catalog backend: the real HTTP ICatalogBackend (debug → local
// aurora-player-server, release → deployed). Bearer-authenticates every call and
// re-hosts the server's baked-in media URIs onto a device-reachable base URL.
// `authHeaders` is the SAME token the shell attaches to the video source +
// subtitle fetch; `resolveCatalogConfig` decides HTTP-vs-demo at the root.
export {
  authHeaders,
  createHttpCatalogBackend,
  rehostMediaUri,
  type HttpCatalogDeps,
} from './composition/http-catalog.js';
export {
  resolveCatalogConfig,
  type CatalogConfig,
  type CatalogConfigInput,
} from './composition/catalog-config.js';

// Epic ③ settings: default subtitle mode + default playback speed, normalized
// and persisted through an injected store port. Pure logic; the device persists
// via `expo-file-system`.
export {
  DEFAULT_PLAYER_PREFS,
  MAX_SPEED,
  MIN_SPEED,
  createPlayerPreferences,
  isSubtitleMode,
  normalizePrefs,
  normalizeSpeed,
  type PlayerPreferences,
  type PlayerPrefsData,
  type PlayerPrefsDeps,
  type PlayerPrefsStore,
} from './composition/player-prefs.js';

// Epic ② player gestures: map a vertical drag over a pane onto a 0..1 volume/
// brightness level. Pure math (no react-native) so both drag gestures share one
// clamped rule.
export { nextLevel } from './composition/gesture-adjust.js';

// Epic ③ settings · data-processing transparency: the static disclosure manifest
// (capability ↔ uses ↔ purpose ↔ retention) + its summary, and the consent-state
// query. Re-exported so the settings leaf reads them from this surface, never
// importing `@aurora/privacy`/`@aurora/domain` directly.
export {
  DEFAULT_PROCESSING_MANIFEST,
  disclosedUses,
  type ProcessingManifest,
  type ProcessingRecord,
} from '@aurora/privacy';
export { isGranted, type ConsentState, type DataUse } from '@aurora/domain';

// Android IPlayer adapter core + the native `<Video>` seam it drives.
export { ReactNativeVideoPlayer } from './adapters/react-native-video-player.js';
export type {
  NativeVideoCallbacks,
  NativeVideoCommands,
  NativeVideoSurface,
  UnbindCallbacks,
} from './adapters/native-video-surface.js';

// Subtitle overlay presenter + its view-state (what `<SubtitleOverlay>` renders).
// Re-exported from the shared `@aurora/presentation` core — mobile and desktop
// consume the exact same implementation.
export {
  SubtitleOverlayPresenter,
  type OverlayListener,
  type OverlayViewState,
} from '@aurora/presentation';

// Word-addressable subtitle surface (portrait list + fullscreen) presenter and
// its view-state, re-exported from the shared core. Also reachable via
// `runtime.subtitleList`. Mobile paints tap/long-press; desktop click/right-click.
export {
  SubtitleListPresenter,
  buildSubtitleLineVMs,
  computeLineWindow,
  type LineWindow,
  type SubtitleDisplayMode,
  type SubtitleLineVM,
  type SubtitleListListener,
  type SubtitleListOptions,
  type SubtitleListViewState,
  type SubtitleWordVM,
} from '@aurora/presentation';

// Epic A/B word interactions: tap/click a subtitle word → seek; long-press/
// right-click → menu (翻译/收藏/示例). Dictionary + vocabulary are injected as
// function-ports, so this core never imports `@aurora/dictionary`/`learning`.
// Also reachable via `runtime.wordActions`.
export {
  createSubtitleWordActions,
  type FavoriteContext,
  type SubtitleWordActions,
  type WordExternalLookup,
  type WordFavorite,
  type WordGloss,
  type WordLookup,
  type WordMenu,
  type WordSense,
} from './composition/subtitle-word-actions.js';

// On-device demo helpers: given the files copied next to a real clip, pick the
// richest subtitle track (word-level first) so the A4 tap-to-seek features get
// exercised. Pure logic — the CI-excluded `App.tsx` supplies the filenames.
export {
  SUBTITLE_EXTENSIONS,
  isWordLevelSubtitle,
  pickBestSubtitle,
  subtitleCandidates,
} from './composition/demo-media.js';
