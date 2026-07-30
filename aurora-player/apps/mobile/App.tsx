import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import type { MediaSource, SourceInput } from '@aurora/player-api';
import {
  emptyConsent,
  withConsent,
  type ConsentRecord,
  type ConsentState,
  type MediaPackage,
} from '@aurora/domain';
import { VideoScreen } from './src/ui/VideoScreen';
import { SourceScreen } from './src/ui/SourceScreen';
import { MarketScreen } from './src/ui/MarketScreen';
import { SettingsScreen } from './src/ui/SettingsScreen';
import { BottomTabBar, type TabKey } from './src/ui/BottomTabBar';
import {
  DEFAULT_PLAYER_PREFS,
  authHeaders,
  createHttpCatalogBackend,
  createMarketplaceControls,
  createPlayerPreferences,
  createRecentSources,
  createSeededCatalog,
  decidePlayback,
  parseUrlSource,
  pickBestSubtitle,
  resolveCatalogConfig,
  type CatalogConfig,
  type PlayerPreferences,
  type PlayerPrefsData,
  type PlayerPrefsStore,
  type RecentSource,
  type RecentSources,
  type RecentSourcesStore,
  type SubtitleDisplayMode,
  type WordExternalLookup,
  type WordFavorite,
} from './src/index';

// `__DEV__` is a React Native global: `true` in a debug (Metro) bundle, `false`
// in a release bundle. It is the switch between the LOCAL dev server and the
// deployed one below. (App.tsx is the CI-excluded device shell, so this ambient
// declaration is for the editor/lint only.)
declare const __DEV__: boolean;

// --- Demo content -----------------------------------------------------------
//
// The app can play (a) a REAL clip copied into its own PRIVATE on-device storage
// (see apps/mobile/scripts/fetch-demo-media.ps1 -Push; must be copied AS THE APP
// via run-as, not adb-pushed to /sdcard), OR (b) any online video/HLS URL typed
// on the home screen. At launch we probe files/ for the demo clip and pick the
// richest subtitle present; the URL path streams straight through the same
// consent gate + player and (for now) plays without subtitles.
const registry = createDefaultRegistry();
const VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.m4v', '.mov', '.mkv', '.webm'];

// Inline subtitle track (real parser, same path as the CLI) used when a device
// clip has no sibling track. URL sources get an empty document — there is no
// local subtitle to pair with a stream (SubX-style AI/online subtitles are a
// phased follow-up; see LLPlayer_Design/next_task.md ③).
const DEMO_SRT = `1
00:00:02,000 --> 00:00:06,000
Welcome to Aurora Player

2
00:00:07,000 --> 00:00:12,000
This is a demo subtitle track

3
00:00:14,000 --> 00:00:19,000
Words highlight as the video plays

4
00:00:22,000 --> 00:00:27,000
Try a WhisperX JSON for word-level sync

5
00:00:30,000 --> 00:00:36,000
Seeking jumps both video and subtitle

6
00:00:40,000 --> 00:00:46,000
Enjoy learning with subtitles!
`;

const EMPTY_DOC: SubtitleDocument = {
  lines: [],
  meta: { format: 'none' },
  hasWordTimings: false,
};

// --- Online subtitled demo (带字幕的 URL) -----------------------------------
//
// A bare typed URL has no subtitle to pair with (它只带 video.uri), so it plays
// silent-of-captions. This shortcut proves the "带字幕的 URL" path end to end: we
// stream an MP4 AND fetch+parse its sibling WebVTT so playback shows REAL, timing-
// matched subtitles. It's a tiny CC-licensed MDN sample (~0.8 MB, cues line up
// with the picture) — the exact pair apps/mobile/scripts/fetch-demo-media.ps1
// stages. Remote, so it flows through the same `network` consent gate.
const ONLINE_SUBTITLE_DEMO = {
  title: '在线字幕示例 (MDN)',
  videoUri:
    'https://raw.githubusercontent.com/mdn/learning-area/main/html/multimedia-and-embedding/tasks/media-embed/media/video.mp4',
  subtitleUri:
    'https://raw.githubusercontent.com/mdn/learning-area/main/html/multimedia-and-embedding/tasks/media-embed/media/subtitles_en.vtt',
} as const;

// Fetch + parse an external subtitle track with the real @aurora/subtitle
// registry (same parser the CLI uses). Any failure (offline, 404, unparsable)
// degrades to an empty document so the video still plays. `fetch` is the device
// runtime's own global; the filename tail only hints the parser at the format.
const fetchSubtitleDoc = async (
  uri: string,
  headers?: Readonly<Record<string, string>>,
): Promise<SubtitleDocument> => {
  try {
    const res = await fetch(uri, headers ? { headers } : undefined);
    if (!res.ok) {
      return EMPTY_DOC;
    }
    const content = await res.text();
    const filename = uri.split(/[?#]/)[0]?.split('/').pop() ?? 'subtitle.vtt';
    const parsed = registry.parse({ content, filename });
    return parsed.ok ? parsed.value : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
};

// --- Media marketplace (Epic C · 本地内存 demo 后端) -------------------------
//
// Two public, license-clear sample sources seeded into an in-memory catalog so
// the market screen browses without an HTTP server. Each carries only a video
// URI + a subtitle-track REF + browse metadata (no bytes, PII or credentials —
// rule ①.E), passing `validateMediaPackage`. A real deployment swaps in an
// `HttpCatalogBackend` at this composition root with no UI change (next_task ③).
// NOTE: market playback now pairs the subtitle track's `uri` into playback —
// when a package declares one (e.g. a server-produced `.whisperx.json`), the
// player fetches + parses it (see playFromMarket). These demo packages declare
// no subtitle `uri`, so they still play with an empty document; a real HTTP
// catalog package carrying `subtitles[].uri` plays with real subtitles.
const DEMO_PACKAGES: readonly MediaPackage[] = [
  {
    id: 'demo-bbb',
    video: {
      uri: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      durationMs: 596_000,
    },
    subtitles: [{ language: 'en', format: 'srt', hasWordTimings: false }],
    meta: { title: 'Big Buck Bunny', sourceLang: 'en', learningLang: 'zh', durationMs: 596_000 },
  },
  {
    id: 'demo-mux-hls',
    video: {
      uri: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      durationMs: 888_000,
    },
    subtitles: [{ language: 'en', format: 'vtt', hasWordTimings: false }],
    meta: { title: 'Mux Test Stream (HLS)', sourceLang: 'en', learningLang: 'zh', durationMs: 888_000 },
  },
];

// --- Catalog backend selection (debug → local server · release → deployed) ---
//
// The DEBUG apk talks to a LOCAL aurora-player-server for hands-on testing; the
// RELEASE apk talks to the deployed one (URL TBD —填真实地址后 release 才启用市场
// 联网). `__DEV__` is the switch. Only the debug/debugOptimized manifests permit
// cleartext http, so the local `http://…:8787` dev URL works there alone.
//
//   ⚠️ EMULATOR vs 真机:
//   • Android emulator → host machine is reachable at `10.0.2.2` (below).
//   • A REAL device on the same Wi-Fi must use the dev machine's LAN IP,
//     e.g. `http://192.168.1.50:8787` — change DEV_CATALOG_URL accordingly.
//
// The token matches the server's `.env` AURORA_CATALOG_TOKEN. It is injected
// ONLY here at the composition root (never baked into catalog data — rule ①.E)
// and flows to three places: the backend's Bearer calls, the video
// `source.headers`, and the subtitle fetch (all via `authHeaders`).
const DEV_CATALOG_URL = 'http://10.0.2.2:8787';
const DEV_CATALOG_TOKEN = 'dev-local-token';
const RELEASE_CATALOG_URL = ''; // TODO: 部署后填入 https://… 真实服务器地址
const RELEASE_CATALOG_TOKEN = ''; // TODO: 部署后注入生产 token

const catalogConfig: CatalogConfig | null = resolveCatalogConfig(
  __DEV__
    ? { enabled: true, baseUrl: DEV_CATALOG_URL, token: DEV_CATALOG_TOKEN }
    : {
        enabled: RELEASE_CATALOG_URL !== '',
        baseUrl: RELEASE_CATALOG_URL,
        token: RELEASE_CATALOG_TOKEN,
      },
);

// Built once at the composition root; stable across renders (no fs needed). Live
// HTTP backend when a config resolved (debug/deployed), else the offline demo
// catalog — same ICatalogBackend port, so the market screen is unchanged (LSP).
const marketplace = createMarketplaceControls(
  catalogConfig
    ? createHttpCatalogBackend(catalogConfig)
    : createSeededCatalog(DEMO_PACKAGES),
);

// The Bearer headers the device must attach when fetching bytes FROM the catalog
// server (video + subtitles). Only server-origin URIs get them — an external CDN
// video in a package (or a demo source) must NOT receive our token. `undefined`
// when running the offline demo catalog.
const catalogHeaders = (uri: string): Readonly<Record<string, string>> | undefined =>
  catalogConfig && uri.startsWith(catalogConfig.baseUrl)
    ? authHeaders(catalogConfig.token)
    : undefined;

// Session-only favourites — a real build persists via @aurora/learning. 翻译 no
// longer uses a hardcoded gloss table: long-press → the device's installed
// translator/dictionary app (see wordExternalLookup below).
const demoFavorites = new Set<string>();
const demoFavorite: WordFavorite = ({ word }) => {
  demoFavorites.add(word);
  return Promise.resolve();
};

// 翻译 handoff: hand the word to whatever translator/dictionary the learner has
// installed (Android intent) — the "use the OS's own dictionary" pathway. Tries
// ACTION_TRANSLATE first (Google Translate & friends), then ACTION_PROCESS_TEXT
// (any app that registered a text action). `expo-intent-launcher` is loaded via
// require so a missing native module degrades to `false` instead of crashing.
const loadIntentLauncher = (): {
  startActivityAsync: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
} | null => {
  try {
    return require('expo-intent-launcher');
  } catch {
    return null;
  }
};
const IntentLauncher = loadIntentLauncher();

const wordExternalLookup: WordExternalLookup = async ({ word }) => {
  if (Platform.OS !== 'android' || IntentLauncher === null) {
    return false;
  }
  const text = word.trim();
  if (text.length === 0) {
    return false;
  }
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.TRANSLATE', {
      extra: { 'android.intent.extra.TEXT': text },
    });
    return true;
  } catch {
    /* no ACTION_TRANSLATE handler — fall back to PROCESS_TEXT */
  }
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.PROCESS_TEXT', {
      type: 'text/plain',
      extra: {
        'android.intent.extra.PROCESS_TEXT': text,
        'android.intent.extra.PROCESS_TEXT_READONLY': true,
      },
    });
    return true;
  } catch {
    return false;
  }
};

/** Parse the inline fallback track (used until/unless a device file is found). */
const parseFallback = (): SubtitleDocument | null => {
  const parsed = registry.parse({ content: DEMO_SRT, filename: 'demo.srt' });
  return parsed.ok ? parsed.value : null;
};

// Minimal shape of the classic (functional) expo-file-system API we rely on.
// SDK 54+ moved these to the `/legacy` subpath; older SDKs keep them on the base
// module (see loadFileSystem). `writeAsStringAsync` persists the recent list +
// consent as JSON in the app's private documents dir (zero extra dependency).
type FunctionalFS = {
  documentDirectory: string | null;
  readDirectoryAsync: (dir: string) => Promise<string[]>;
  readAsStringAsync: (uri: string) => Promise<string>;
  writeAsStringAsync: (uri: string, contents: string) => Promise<void>;
};

const loadFileSystem = (): { fs: FunctionalFS | null; diag: string } => {
  const notes: string[] = [];
  try {
    const legacy = require('expo-file-system/legacy') as Partial<FunctionalFS>;
    if (typeof legacy.readDirectoryAsync === 'function') {
      return { fs: legacy as FunctionalFS, diag: 'legacy OK' };
    }
    notes.push(`legacy required, readDirectoryAsync=${typeof legacy.readDirectoryAsync}`);
  } catch (e) {
    notes.push(`legacy require threw: ${String(e)}`);
  }
  try {
    const base = require('expo-file-system') as Partial<FunctionalFS>;
    if (typeof base.readDirectoryAsync === 'function') {
      return { fs: base as FunctionalFS, diag: 'base OK' };
    }
    notes.push(`base required, readDirectoryAsync=${typeof base.readDirectoryAsync}`);
  } catch (e) {
    notes.push(`base require threw: ${String(e)}`);
  }
  return { fs: null, diag: notes.join(' | ') };
};

// --- Persistence adapters (device shell wiring for the tested core ports) ----

const RECENT_FILE = 'recent-sources.json';
const CONSENT_FILE = 'consent.json';
const PREFS_FILE = 'player-prefs.json';

/** Back the tested `PlayerPrefsStore` port with a JSON file in documents/. */
const makePrefsStore = (fs: FunctionalFS): PlayerPrefsStore => {
  const path = (fs.documentDirectory ?? '') + PREFS_FILE;
  return {
    load: async () => {
      try {
        const parsed = JSON.parse(await fs.readAsStringAsync(path));
        return (parsed ?? {}) as Partial<PlayerPrefsData>;
      } catch {
        return {};
      }
    },
    save: async (data) => {
      try {
        await fs.writeAsStringAsync(path, JSON.stringify(data));
      } catch {
        /* best-effort persistence; a write failure just loses the preference */
      }
    },
  };
};

/** Back the tested `RecentSourcesStore` port with a JSON file in documents/. */
const makeRecentStore = (fs: FunctionalFS): RecentSourcesStore => {
  const path = (fs.documentDirectory ?? '') + RECENT_FILE;
  return {
    load: async () => {
      try {
        const parsed = JSON.parse(await fs.readAsStringAsync(path));
        return Array.isArray(parsed) ? (parsed as RecentSource[]) : [];
      } catch {
        return [];
      }
    },
    save: async (list) => {
      try {
        await fs.writeAsStringAsync(path, JSON.stringify(list));
      } catch {
        /* best-effort persistence; a write failure just loses history */
      }
    },
  };
};

const loadConsent = async (fs: FunctionalFS): Promise<ConsentState> => {
  try {
    const path = (fs.documentDirectory ?? '') + CONSENT_FILE;
    const records = JSON.parse(await fs.readAsStringAsync(path)) as ConsentRecord[];
    let state = emptyConsent();
    for (const r of records) {
      state = withConsent(state, r.use, r.granted, r.at);
    }
    return state;
  } catch {
    return emptyConsent();
  }
};

const saveConsent = async (fs: FunctionalFS, state: ConsentState): Promise<void> => {
  try {
    const path = (fs.documentDirectory ?? '') + CONSENT_FILE;
    await fs.writeAsStringAsync(path, JSON.stringify([...state.values()]));
  } catch {
    /* best-effort */
  }
};

// Probe result for the on-device demo clip (offered as a home-screen shortcut).
type DeviceProbe =
  | { ok: true; media: MediaSource; document: SubtitleDocument; note: string }
  | { ok: false; note: string };

const loadDeviceDemo = async (
  fs: FunctionalFS | null,
  fallbackDoc: SubtitleDocument | null,
): Promise<DeviceProbe> => {
  if (!fs) {
    return { ok: false, note: 'expo-file-system unavailable' };
  }
  const dir = fs.documentDirectory ?? null;
  if (!dir) {
    return { ok: false, note: 'FileSystem.documentDirectory is null.' };
  }
  let names: string[];
  try {
    names = await fs.readDirectoryAsync(dir);
  } catch (e) {
    return { ok: false, note: `readDirectoryAsync failed: ${String(e)}` };
  }
  const video = names.find((n) =>
    VIDEO_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)),
  );
  if (video === undefined) {
    return { ok: false, note: `No device clip in ${dir}` };
  }
  const media: MediaSource = { id: `demo-${video}`, uri: dir + video, title: video };
  const subtitle = pickBestSubtitle(names);
  if (subtitle !== null) {
    try {
      const content = await fs.readAsStringAsync(dir + subtitle);
      const parsed = registry.parse({ content, filename: subtitle });
      if (parsed.ok) {
        return { ok: true, media, document: parsed.value, note: `video=${video}, sub=${subtitle}` };
      }
    } catch {
      /* fall through to the inline fallback */
    }
  }
  if (fallbackDoc !== null) {
    return { ok: true, media, document: fallbackDoc, note: `video=${video} (inline subtitle)` };
  }
  return { ok: false, note: `Found ${video} but no usable subtitle.` };
};

type Playback = { readonly media: MediaSource; readonly document: SubtitleDocument };

export default function App(): React.JSX.Element {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<'home' | 'player' | 'market' | 'settings'>('home');
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [deviceProbe, setDeviceProbe] = useState<DeviceProbe | null>(null);
  const [recentList, setRecentList] = useState<readonly RecentSource[]>([]);
  const [consent, setConsent] = useState<ConsentState>(emptyConsent());
  const [prefs, setPrefs] = useState<PlayerPrefsData>(DEFAULT_PLAYER_PREFS);
  const [urlText, setUrlText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingInput, setPendingInput] = useState<SourceInput | null>(null);
  // Subtitle URL to pair with `pendingInput` once consent is granted (online
  // subtitled demo); null for the bare-URL path which has no track.
  const [pendingSubtitleUri, setPendingSubtitleUri] = useState<string | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);

  const fsRef = useRef<FunctionalFS | null>(null);
  const recentRef = useRef<RecentSources | null>(null);
  const prefsRef = useRef<PlayerPreferences | null>(null);

  useEffect(() => {
    let alive = true;
    const fallbackDoc = parseFallback();
    void (async () => {
      const { fs } = loadFileSystem();
      fsRef.current = fs;
      if (fs) {
        recentRef.current = createRecentSources({
          store: makeRecentStore(fs),
          now: () => Date.now(),
        });
        prefsRef.current = createPlayerPreferences({ store: makePrefsStore(fs) });
      }
      const [probe, savedConsent, savedRecent, savedPrefs] = await Promise.all([
        loadDeviceDemo(fs, fallbackDoc),
        fs ? loadConsent(fs) : Promise.resolve(emptyConsent()),
        recentRef.current ? recentRef.current.list() : Promise.resolve([]),
        prefsRef.current ? prefsRef.current.get() : Promise.resolve(DEFAULT_PLAYER_PREFS),
      ]);
      if (!alive) return;
      setDeviceProbe(probe);
      setConsent(savedConsent);
      setRecentList(savedRecent);
      setPrefs(savedPrefs);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openSource = async (
    media: MediaSource,
    input: SourceInput,
    subtitleUri?: string,
  ): Promise<void> => {
    // Pair a fetched subtitle track when one was supplied (online subtitled
    // demo); a bare URL has none, so it plays with an empty document as before.
    const document =
      subtitleUri !== undefined ? await fetchSubtitleDoc(subtitleUri) : EMPTY_DOC;
    setPlayback({ media, document });
    setView('player');
    if (input.kind === 'uri' && recentRef.current) {
      const title = input.title ?? input.uri;
      setRecentList(await recentRef.current.add(input.uri, title));
    }
  };

  const attemptPlay = (input: SourceInput, state: ConsentState, subtitleUri?: string): void => {
    const decision = decidePlayback(input, state);
    if (!decision.ready) {
      setPendingInput(input);
      setPendingSubtitleUri(subtitleUri ?? null);
      setConsentPrompt(true);
      return;
    }
    void openSource(decision.media, input, subtitleUri);
  };

  // Stream the online demo video AND its sibling WebVTT so it plays WITH real
  // subtitles. Remote → routed through the same consent gate as any URL.
  const playOnlineDemo = (): void => {
    const parsed = parseUrlSource(ONLINE_SUBTITLE_DEMO.videoUri, ONLINE_SUBTITLE_DEMO.title);
    if (parsed.ok) {
      attemptPlay(parsed.input, consent, ONLINE_SUBTITLE_DEMO.subtitleUri);
    }
  };

  const submitUrl = (): void => {
    const parsed = parseUrlSource(urlText);
    if (!parsed.ok) {
      setError(parsed.reason === 'empty' ? '请输入视频链接' : '链接无效，请输入 http/https 视频地址');
      return;
    }
    setError(null);
    setUrlText('');
    attemptPlay(parsed.input, consent);
  };

  const replay = (s: RecentSource): void => {
    const parsed = parseUrlSource(s.uri, s.title);
    if (parsed.ok) {
      attemptPlay(parsed.input, consent);
    }
  };

  // Grant/revoke `network` consent, persist, and return the new state so callers
  // can retry a gated action against the fresh value. Date.now() is the accepted
  // device-shell clock (rule ①.C.13); the decision itself stays in the core gate.
  const setNetworkConsent = (granted: boolean): ConsentState => {
    const next = withConsent(consent, 'network', granted, Date.now());
    setConsent(next);
    if (fsRef.current) {
      void saveConsent(fsRef.current, next);
    }
    return next;
  };

  const grantConsent = (): void => {
    const next = setNetworkConsent(true);
    setConsentPrompt(false);
    if (pendingInput) {
      const input = pendingInput;
      const subUri = pendingSubtitleUri;
      setPendingInput(null);
      setPendingSubtitleUri(null);
      const decision = decidePlayback(input, next);
      if (decision.ready) {
        void openSource(decision.media, input, subUri ?? undefined);
      }
    }
  };

  const dismissConsent = (): void => {
    setConsentPrompt(false);
    setPendingInput(null);
    setPendingSubtitleUri(null);
  };

  // Play a marketplace-resolved source. When the package declared a subtitle
  // `uri` (e.g. a server-produced `.whisperx.json`), fetch + parse it with the
  // same registry the URL path uses; any failure degrades to an empty document
  // so the video still plays. Network access already passed the market's
  // `network` consent gate before we get here.
  const playFromMarket = (m: MediaSource, subtitleUri?: string): void => {
    // Attach the catalog's Bearer token to a server-origin video so the
    // token-gated /media/:id/video byte fetch is authorized (external URLs get
    // no header — see catalogHeaders). The streaming adapter forwards
    // `media.headers` to react-native-video's `source.headers`.
    const videoHeaders = catalogHeaders(m.uri);
    const media: MediaSource = videoHeaders ? { ...m, headers: videoHeaders } : m;
    if (subtitleUri === undefined) {
      setPlayback({ media, document: EMPTY_DOC });
      setView('player');
      return;
    }
    void (async () => {
      // The subtitle track lives on the same gated server → same Bearer header,
      // enabling the word-timed `.whisperx.json` fetch that powers 按词快进快退.
      const document = await fetchSubtitleDoc(subtitleUri, catalogHeaders(subtitleUri));
      setPlayback({ media, document });
      setView('player');
    })();
  };

  const setSubtitleMode = async (mode: SubtitleDisplayMode): Promise<void> => {
    setPrefs(
      prefsRef.current
        ? await prefsRef.current.setSubtitleMode(mode)
        : { ...prefs, subtitleMode: mode },
    );
  };
  const setSpeed = async (speed: number): Promise<void> => {
    setPrefs(
      prefsRef.current ? await prefsRef.current.setSpeed(speed) : { ...prefs, speed },
    );
  };
  const clearHistory = async (): Promise<void> => {
    setRecentList(recentRef.current ? await recentRef.current.clear() : []);
  };

  const renameRecent = async (s: RecentSource, title: string): Promise<void> => {
    if (recentRef.current) {
      setRecentList(await recentRef.current.rename(s.uri, title));
    }
  };
  const toggleFavorite = async (s: RecentSource): Promise<void> => {
    if (recentRef.current) {
      setRecentList(await recentRef.current.toggleFavorite(s.uri));
    }
  };
  const removeRecent = async (s: RecentSource): Promise<void> => {
    if (recentRef.current) {
      setRecentList(await recentRef.current.remove(s.uri));
    }
  };

  if (!ready) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Aurora Player</Text>
        <Text style={styles.hint}>Loading…</Text>
      </View>
    );
  }

  if (view === 'player' && playback !== null) {
    return (
      <VideoScreen
        media={playback.media}
        document={playback.document}
        subtitleMode={prefs.subtitleMode}
        initialSpeed={prefs.speed}
        wordExternalLookup={wordExternalLookup}
        wordFavorite={demoFavorite}
        onBack={() => setView('home')}
      />
    );
  }

  const deviceDemo =
    deviceProbe?.ok === true
      ? {
          title: deviceProbe.media.title ?? 'demo',
          onPlay: (): void => {
            setPlayback({ media: deviceProbe.media, document: deviceProbe.document });
            setView('player');
          },
        }
      : null;

  // The three top-level destinations share a persistent bottom tab bar (市场/设置
  // moved off the home header into the bar the user expects at the screen bottom).
  // The full-screen player is handled by the early return above and shows no bar.
  const body =
    view === 'market' ? (
      <MarketScreen
        controls={marketplace}
        consent={consent}
        onGrantConsent={() => Promise.resolve(setNetworkConsent(true))}
        onPlay={playFromMarket}
      />
    ) : view === 'settings' ? (
      <SettingsScreen
        consent={consent}
        onSetNetworkConsent={(g) => {
          setNetworkConsent(g);
        }}
        prefs={prefs}
        onSetSubtitleMode={(m) => void setSubtitleMode(m)}
        onSetSpeed={(n) => void setSpeed(n)}
        historyCount={recentList.length}
        onClearHistory={() => void clearHistory()}
      />
    ) : (
      <SourceScreen
        urlText={urlText}
        onChangeUrl={setUrlText}
        onSubmitUrl={submitUrl}
        error={error}
        recent={recentList}
        onReplay={replay}
        onRename={(s, title) => void renameRecent(s, title)}
        onToggleFavorite={(s) => void toggleFavorite(s)}
        onRemove={(s) => void removeRecent(s)}
        deviceDemo={deviceDemo}
        onlineDemo={{ title: ONLINE_SUBTITLE_DEMO.title, onPlay: playOnlineDemo }}
        consentPrompt={consentPrompt}
        onGrantConsent={grantConsent}
        onDismissConsent={dismissConsent}
      />
    );

  const activeTab: TabKey =
    view === 'market' ? 'market' : view === 'settings' ? 'settings' : 'home';

  return (
    <View style={styles.tabbedRoot}>
      <View style={styles.tabbedBody}>{body}</View>
      <BottomTabBar active={activeTab} onSelect={setView} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Tabbed shell: the active screen fills the space above a persistent tab bar.
  tabbedRoot: { flex: 1, backgroundColor: '#0b0b0f' },
  tabbedBody: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0b0f',
    gap: 8,
    padding: 24,
  },
  title: { color: '#fff', fontSize: 24, fontWeight: '600' },
  hint: { color: '#9aa0aa', fontSize: 14, textAlign: 'center' },
});
