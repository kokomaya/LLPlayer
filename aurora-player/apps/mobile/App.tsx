import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createDefaultRegistry, type SubtitleDocument } from '@aurora/subtitle';
import type { MediaSource } from '@aurora/player-api';
import { VideoScreen } from './src/ui/VideoScreen';
import {
  pickBestSubtitle,
  type WordFavorite,
  type WordGloss,
  type WordLookup,
} from './src/index';

// --- Demo content -----------------------------------------------------------
//
// The app plays a REAL clip copied into its own PRIVATE on-device storage
// (/data/data/<pkg>/files, which is what `FileSystem.documentDirectory` maps
// to). Populate it with:
//   apps/mobile/scripts/fetch-demo-media.ps1 -Push        # tiny matched clip
//   apps/mobile/scripts/fetch-demo-media.ps1 -Clip sintel -WhisperX -Push
// The file MUST be copied AS THE APP (run-as), not adb-pushed to /sdcard, or
// the app gets EACCES (see the android-demo-media-run-as-copy note).
//
// At launch we list files/, pick the richest subtitle present (whisperx > srt >
// … via pickBestSubtitle) and parse it with the real @aurora/subtitle registry.
// If nothing is on the device yet, we fall back to the inline track below so the
// app always shows something.
const registry = createDefaultRegistry();
const VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.m4v', '.mov', '.mkv', '.webm'];

// Inline subtitle track, parsed by the real parser (same code path as the CLI).
// Used as the subtitle when a device video has no sibling track — we never hand
// ExoPlayer a made-up video path (that yields ERROR_CODE_IO_FILE_NOT_FOUND), so
// there is deliberately no hardcoded FALLBACK_MEDIA: no on-device video ⇒ show a
// hint screen instead of playing a URI that isn't there.
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

// Offline demo dictionary + vocabulary — the two heavy ports (@aurora/dictionary
// / @aurora/learning) are NOT imported here; instead we inject tiny local stubs
// so 翻译/示例/收藏 work with zero network and zero keys (security rule ①.E). A
// real build swaps these for the installed dictionary + vocabulary store.
const DEMO_GLOSSARY: Record<string, WordGloss> = {
  welcome: { headword: 'welcome', senses: [{ definition: '欢迎；迎接', partOfSpeech: 'v.', examples: ['Welcome home', 'They welcomed us warmly'] }] },
  aurora: { headword: 'aurora', senses: [{ definition: '极光；曙光', partOfSpeech: 'n.', examples: ['the northern aurora'] }] },
  player: { headword: 'player', senses: [{ definition: '播放器；玩家', partOfSpeech: 'n.', examples: ['a media player'] }] },
  demo: { headword: 'demo', senses: [{ definition: '演示；样例', partOfSpeech: 'n.', examples: ['a quick demo'] }] },
  subtitle: { headword: 'subtitle', senses: [{ definition: '字幕', partOfSpeech: 'n.', examples: ['turn on subtitles'] }] },
  word: { headword: 'word', senses: [{ definition: '词；单词', partOfSpeech: 'n.', examples: ['a new word'] }] },
  words: { headword: 'word', senses: [{ definition: '词；单词（复数）', partOfSpeech: 'n.', examples: ['learn ten words'] }] },
  highlight: { headword: 'highlight', senses: [{ definition: '突出显示；高亮', partOfSpeech: 'v.', examples: ['highlight the active word'] }] },
  video: { headword: 'video', senses: [{ definition: '视频', partOfSpeech: 'n.', examples: ['watch a video'] }] },
  sync: { headword: 'sync', senses: [{ definition: '同步', partOfSpeech: 'n.', examples: ['audio in sync'] }] },
  seeking: { headword: 'seek', senses: [{ definition: '跳转；寻找', partOfSpeech: 'v.', examples: ['seeking a new position'] }] },
  learning: { headword: 'learn', senses: [{ definition: '学习', partOfSpeech: 'v.', examples: ['learning a language'] }] },
  first: { headword: 'first', senses: [{ definition: '第一的；首先', partOfSpeech: 'adj.', examples: ['the first subtitle'] }] },
  second: { headword: 'second', senses: [{ definition: '第二的；秒', partOfSpeech: 'adj.', examples: ['the second line'] }] },
  third: { headword: 'third', senses: [{ definition: '第三的', partOfSpeech: 'adj.', examples: ['the third cue'] }] },
};

const demoLookup: WordLookup = (word) => {
  const key = word.toLowerCase().replace(/[^a-z]/g, '');
  return Promise.resolve(DEMO_GLOSSARY[key] ?? null);
};

// Session-only favourites — a real build persists via @aurora/learning.
const demoFavorites = new Set<string>();
const demoFavorite: WordFavorite = ({ word }) => {
  demoFavorites.add(word);
  return Promise.resolve();
};

/** Parse the inline fallback track (used until/unless a device file is found). */
const parseFallback = (): SubtitleDocument | null => {
  const parsed = registry.parse({ content: DEMO_SRT, filename: 'demo.srt' });
  return parsed.ok ? parsed.value : null;
};

// Minimal shape of the classic (functional) expo-file-system API we rely on.
type FunctionalFS = {
  documentDirectory: string | null;
  readDirectoryAsync: (dir: string) => Promise<string[]>;
  readAsStringAsync: (uri: string) => Promise<string>;
};

/**
 * Resolve the functional file-system API across Expo SDKs. SDK 54+ moved
 * `documentDirectory`/`readDirectoryAsync`/`readAsStringAsync` to the `/legacy`
 * subpath (the base module now exposes the new File/Directory classes instead);
 * older SDKs keep them on the base module. We use synchronous `require` with
 * string-literal specifiers so Metro bundles whichever is present into the MAIN
 * bundle — a dynamic `await import()` here would be split into a separate RN
 * chunk that can't see the main bundle's module registry ("Requiring unknown
 * module"). Returns null if the module isn't installed at all (⇒ hint screen).
 */
const loadFileSystem = (): { fs: FunctionalFS | null; diag: string } => {
  const notes: string[] = [];
  try {
    const legacy = require('expo-file-system/legacy') as Partial<FunctionalFS>;
    if (typeof legacy.readDirectoryAsync === 'function') {
      return { fs: legacy as FunctionalFS, diag: 'legacy OK' };
    }
    // Resolved as a module but no functional API → Metro/exports resolution issue.
    notes.push(`legacy required, readDirectoryAsync=${typeof legacy.readDirectoryAsync}`);
  } catch (e) {
    // require threw → almost always the NATIVE module isn't in the APK.
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

// Probe result carries a human-readable `note` so failures are visible ON THE
// DEVICE (the hint screen prints it) instead of collapsing every cause into a
// single opaque "No demo media" — this is the primary way to debug why a real
// clip isn't loading without wiring up a JS debugger.
type DeviceProbe =
  | { ok: true; media: MediaSource; document: SubtitleDocument; note: string }
  | { ok: false; note: string };

/**
 * Probe the app's private files dir for a real clip. On success returns the video
 * (required) plus the richest device subtitle that parses, or the inline fallback
 * track when no sibling subtitle is present/parseable. On failure returns a
 * diagnostic `note` naming the exact step that failed — we never hand ExoPlayer a
 * made-up path (that yields ERROR_CODE_IO_FILE_NOT_FOUND).
 */
const loadDeviceDemo = async (
  fallbackDoc: SubtitleDocument | null,
): Promise<DeviceProbe> => {
  let fsResult: { fs: FunctionalFS | null; diag: string };
  try {
    fsResult = loadFileSystem();
  } catch (e) {
    return { ok: false, note: `loadFileSystem threw: ${String(e)}` };
  }
  const FileSystem = fsResult.fs;
  if (!FileSystem) {
    // fsResult.diag names the ACTUAL failure:
    //  • "import threw: ..."      → native module missing from the APK ⇒ REBUILD dev client
    //  • "imported, readDirectoryAsync=undefined" → Metro/exports resolution ⇒ metro.config
    return {
      ok: false,
      note: `expo-file-system unavailable\n${fsResult.diag}`,
    };
  }
  const dir = FileSystem.documentDirectory ?? null;
  if (!dir) {
    return { ok: false, note: 'FileSystem.documentDirectory is null.' };
  }
  let names: string[];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch (e) {
    return { ok: false, note: `readDirectoryAsync failed: ${String(e)}` };
  }
  const listing = names.length > 0 ? names.join(', ') : '(empty)';
  const video = names.find((n) =>
    VIDEO_EXTENSIONS.some((ext) => n.toLowerCase().endsWith(ext)),
  );
  if (video === undefined) {
    return { ok: false, note: `No video in\n${dir}\nfiles: ${listing}` };
  }
  const media: MediaSource = { id: `demo-${video}`, uri: dir + video, title: video };
  // Prefer a device subtitle that actually parses; otherwise fall back to the
  // inline track so the clip still plays (just without word-level device sync).
  const subtitle = pickBestSubtitle(names);
  if (subtitle !== null) {
    try {
      const content = await FileSystem.readAsStringAsync(dir + subtitle);
      const parsed = registry.parse({ content, filename: subtitle });
      if (parsed.ok) {
        return { ok: true, media, document: parsed.value, note: `video=${video}, sub=${subtitle}` };
      }
      if (fallbackDoc !== null) {
        return { ok: true, media, document: fallbackDoc, note: `video=${video}, sub=${subtitle} PARSE FAILED → inline` };
      }
    } catch (e) {
      if (fallbackDoc !== null) {
        return { ok: true, media, document: fallbackDoc, note: `video=${video}, sub read failed → inline (${String(e)})` };
      }
    }
  }
  if (fallbackDoc !== null) {
    return { ok: true, media, document: fallbackDoc, note: `video=${video} (no device subtitle → inline)` };
  }
  return { ok: false, note: `Found ${video} but no usable subtitle and no inline fallback.` };
};

export default function App(): React.JSX.Element {
  const fallbackDoc = useMemo(parseFallback, []);
  const [probe, setProbe] = useState<DeviceProbe | null>(null);

  useEffect(() => {
    let alive = true;
    void loadDeviceDemo(fallbackDoc).then((result) => {
      if (alive) {
        // Also log to Metro / `adb logcat -s ReactNativeJS` for off-device tracing.
        console.log('[Aurora] device probe:', result.note);
        setProbe(result);
      }
    });
    return () => {
      alive = false;
    };
  }, [fallbackDoc]);

  if (probe === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Aurora Player</Text>
        <Text style={styles.hint}>Loading demo…</Text>
      </View>
    );
  }

  // No playable video on the device — never hand ExoPlayer a made-up path (that
  // is the ERROR_CODE_IO_FILE_NOT_FOUND you saw). Print the reason for debugging.
  if (!probe.ok) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Aurora Player</Text>
        <Text style={styles.hint}>No demo media loaded.</Text>
        <Text style={styles.debug}>{probe.note}</Text>
        <Text style={styles.hint}>
          Push one with: apps/mobile/scripts/fetch-demo-media.ps1 -Push
        </Text>
      </View>
    );
  }

  return (
    <VideoScreen
      media={probe.media}
      document={probe.document}
      subtitleMode="list"
      wordLookup={demoLookup}
      wordFavorite={demoFavorite}
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
  debug: {
    color: '#ffcc66',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
});
