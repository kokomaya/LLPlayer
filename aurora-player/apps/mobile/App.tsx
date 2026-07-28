import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import type { MediaSource, SourceInput } from '@aurora/player-api';
import {
  emptyConsent,
  withConsent,
  type ConsentRecord,
  type ConsentState,
} from '@aurora/domain';
import { VideoScreen } from './src/ui/VideoScreen';
import { SourceScreen } from './src/ui/SourceScreen';
import {
  createRecentSources,
  decidePlayback,
  parseUrlSource,
  pickBestSubtitle,
  type RecentSource,
  type RecentSources,
  type RecentSourcesStore,
  type WordExternalLookup,
  type WordFavorite,
} from './src/index';

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
  const [view, setView] = useState<'home' | 'player'>('home');
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [deviceProbe, setDeviceProbe] = useState<DeviceProbe | null>(null);
  const [recentList, setRecentList] = useState<readonly RecentSource[]>([]);
  const [consent, setConsent] = useState<ConsentState>(emptyConsent());
  const [urlText, setUrlText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendingInput, setPendingInput] = useState<SourceInput | null>(null);
  const [consentPrompt, setConsentPrompt] = useState(false);

  const fsRef = useRef<FunctionalFS | null>(null);
  const recentRef = useRef<RecentSources | null>(null);

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
      }
      const [probe, savedConsent, savedRecent] = await Promise.all([
        loadDeviceDemo(fs, fallbackDoc),
        fs ? loadConsent(fs) : Promise.resolve(emptyConsent()),
        recentRef.current ? recentRef.current.list() : Promise.resolve([]),
      ]);
      if (!alive) return;
      setDeviceProbe(probe);
      setConsent(savedConsent);
      setRecentList(savedRecent);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openSource = async (media: MediaSource, input: SourceInput): Promise<void> => {
    setPlayback({ media, document: EMPTY_DOC });
    setView('player');
    if (input.kind === 'uri' && recentRef.current) {
      const title = input.title ?? input.uri;
      setRecentList(await recentRef.current.add(input.uri, title));
    }
  };

  const attemptPlay = (input: SourceInput, state: ConsentState): void => {
    const decision = decidePlayback(input, state);
    if (!decision.ready) {
      setPendingInput(input);
      setConsentPrompt(true);
      return;
    }
    void openSource(decision.media, input);
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

  const grantConsent = async (): Promise<void> => {
    const next = withConsent(consent, 'network', true, Date.now());
    setConsent(next);
    setConsentPrompt(false);
    if (fsRef.current) {
      void saveConsent(fsRef.current, next);
    }
    if (pendingInput) {
      const input = pendingInput;
      setPendingInput(null);
      const decision = decidePlayback(input, next);
      if (decision.ready) {
        void openSource(decision.media, input);
      }
    }
  };

  const dismissConsent = (): void => {
    setConsentPrompt(false);
    setPendingInput(null);
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
        subtitleMode="list"
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

  return (
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
      consentPrompt={consentPrompt}
      onGrantConsent={() => void grantConsent()}
      onDismissConsent={dismissConsent}
    />
  );
}

const styles = StyleSheet.create({
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
