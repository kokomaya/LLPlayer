//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// tsconfig `include` is `src/**/*.ts` (no .tsx) so `tsc` never sees this, and
// vitest coverage excludes `src/ui/**`, so it is type-validated on a device via
// Expo/Metro (where `react` / `react-native` / `react-native-video` are
// installed), not here. It IS linted — ESLint only ignores `**/*.example.tsx`,
// so this leaf stays syntactically clean. The companion `.example.tsx` variant
// exists purely as a copy-me template for a fresh device wiring.
//
// It is the THIN native leaf of the ports-&-adapters design (plan/04): all it
// does is adapt the imperative `react-native-video` `<Video ref>` handle to the
// pure `NativeVideoSurface` port, then hand that surface to the pure
// `createPlayerRuntime` composition root. Zero playback/subtitle logic lives
// here — that all sits in the Node-tested core. The floating controls live in the
// sibling `PlayerChrome.tsx`; the volume/brightness drag math is the tested
// `nextLevel` core; only the imperative gesture plumbing is here.
//
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  PanResponder,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PanResponderGestureState,
} from 'react-native';
import Video, { ViewType, type VideoRef } from 'react-native-video';
import {
  createPlayerRuntime,
  nextLevel,
  type LearningControls,
  type PlayerRuntime,
  type SubtitleDisplayMode,
  type SubtitleListViewState,
  type SubtitleWordActions,
  type TransportControls,
  type TransportState,
  type WordExternalLookup,
  type WordFavorite,
  type WordLookup,
} from '../index.js';
import type {
  NativeVideoCallbacks,
  NativeVideoSurface,
} from '../adapters/native-video-surface.js';
import type { MediaSource } from '@aurora/player-api';
import type { SubtitleDocument } from '@aurora/subtitle';
import { SubtitleOverlay } from './SubtitleOverlay.js';
import { SubtitleList } from './SubtitleList.js';
import { PlayerChrome } from './PlayerChrome.js';
import type { OverlayViewState } from '@aurora/presentation';

// Display modes cycled by the ⤢ toggle, in order. `overlay` = the classic
// single-line caption over the picture; `list` = subx-style scrollable transcript
// BELOW the video (portrait); `fullscreen` = a fixed window of source lines over
// the picture. All three are painted from the SAME presenters — see SubtitleList.
const MODE_CYCLE: readonly SubtitleDisplayMode[] = ['overlay', 'list', 'fullscreen'];
const MODE_LABEL: Record<SubtitleDisplayMode, string> = {
  overlay: '单行',
  list: '列表',
  fullscreen: '全屏',
};

// Playback rates cycled by the 倍速 pill (all inside the core's [0.5,2] band).
const SPEED_CYCLE: readonly number[] = [0.75, 1, 1.25, 1.5, 2];
// A ±10s double-tap must be a quick, near-stationary touch — these bound it.
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 12;

// expo-brightness / expo-screen-orientation are optional native modules — loaded
// via require() so a build missing them degrades gracefully instead of crashing
// (same pattern as App.tsx's expo-intent-launcher). Both are only needed on the
// device; in CI this file is never executed.
type BrightnessModule = { setBrightnessAsync: (v: number) => Promise<void>; getBrightnessAsync: () => Promise<number> };
const loadBrightness = (): BrightnessModule | null => {
  try {
    return require('expo-brightness') as BrightnessModule;
  } catch {
    return null;
  }
};
type OrientationModule = {
  lockAsync: (lock: number) => Promise<void>;
  unlockAsync: () => Promise<void>;
  OrientationLock: { PORTRAIT_UP: number; LANDSCAPE: number };
};
const loadOrientation = (): OrientationModule | null => {
  try {
    return require('expo-screen-orientation') as OrientationModule;
  } catch {
    return null;
  }
};

export interface VideoScreenProps {
  readonly media: MediaSource;
  readonly document: SubtitleDocument;
  /**
   * Sink for copied subtitle text (Epic A · 复制字幕). Wire this to the
   * clipboard on device, e.g. `expo-clipboard`:
   *   onCopyText={(t) => { void Clipboard.setStringAsync(t); }}
   * Left as a prop so this reference file needs no clipboard dependency.
   */
  readonly onCopyText?: (text: string) => void;
  /** Initial subtitle layout (overlay | list | fullscreen). Default `list`. */
  readonly subtitleMode?: SubtitleDisplayMode;
  /** Initial playback rate (from the saved default, Epic ③). Default 1. */
  readonly initialSpeed?: number;
  /** Source-line count shown in fullscreen mode (a wrapped line counts as one). */
  readonly subtitleLineCount?: number;
  /**
   * Dictionary lookup for the long-press word menu (翻译/示例). Injected as a
   * function-port by App.tsx so this leaf never imports `@aurora/dictionary`.
   */
  readonly wordLookup?: WordLookup;
  /** Vocabulary sink for the 收藏 action, injected the same way (Epic B). */
  readonly wordFavorite?: WordFavorite;
  /**
   * External translator/dictionary handoff for 翻译 (long-press word). Injected
   * by App.tsx so this leaf never imports `expo-intent-launcher`; when absent the
   * menu hides the "open in translator" action.
   */
  readonly wordExternalLookup?: WordExternalLookup;
  /** Optional toast when a word is saved (收藏). */
  readonly onFavorited?: (word: string) => void;
  /** Optional "back to home" affordance (shown when the URL home is wired). */
  readonly onBack?: () => void;
}

/**
 * Bridge a `react-native-video` ref to the {@link NativeVideoSurface} port.
 * `react-native-video` reports/accepts times in SECONDS, which is exactly the
 * convention the port declares, so no conversion happens here — the adapter
 * core owns the seconds↔ms boundary. `setRate` lifts the rate into React state
 * so the declarative `<Video rate>` prop applies it.
 */
const surfaceFromRef = (
  ref: React.RefObject<VideoRef | null>,
  setUri: (uri: string | null) => void,
  setRate: (rate: number) => void,
  callbacksRef: React.MutableRefObject<NativeVideoCallbacks | null>,
): NativeVideoSurface => ({
  commands: {
    load: (uri) => setUri(uri),
    play: () => ref.current?.resume(),
    pause: () => ref.current?.pause(),
    seek: (positionSec) => ref.current?.seek(positionSec),
    setRate: (rate) => setRate(rate),
    release: () => setUri(null),
  },
  bind: (callbacks) => {
    callbacksRef.current = callbacks;
    return () => {
      if (callbacksRef.current === callbacks) {
        callbacksRef.current = null;
      }
    };
  },
});

export function VideoScreen({
  media,
  document,
  onCopyText,
  subtitleMode,
  initialSpeed,
  subtitleLineCount,
  wordLookup,
  wordFavorite,
  wordExternalLookup,
  onFavorited,
  onBack,
}: VideoScreenProps): React.JSX.Element {
  // Rotation redraws this view (Manifest declares orientation|screenSize
  // configChanges), so we derive the layout from live dimensions rather than a
  // static orientation prop.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  // Status-bar height so the top pills clear the system clock/battery icons.
  // Android-only API — undefined ⇒ 0 elsewhere.
  const topInset = StatusBar.currentHeight ?? 0;
  const videoRef = useRef<VideoRef | null>(null);
  const callbacksRef = useRef<NativeVideoCallbacks | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayViewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Playback rate (倍速) — driven declaratively; the core routes speed changes
  // through the adapter → surface.setRate → this state → <Video rate>.
  const [rate, setRate] = useState(initialSpeed ?? 1);
  // Volume (音量) via RN-video's own `volume` prop (0..1), driven by right-half
  // vertical drags. A ref mirrors it so the gesture reads the live value.
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  // Screen brightness (亮度) is an OS setting, not a Video prop — held in a ref
  // and pushed to expo-brightness on left-half drags.
  const brightnessRef = useRef(1);
  // Subtitle visibility toggle (字幕开/关) — a pure UI short-circuit this round.
  const [subsHidden, setSubsHidden] = useState(false);
  // Lock (锁屏) hides the chrome + suppresses gestures to avoid mis-touches.
  const [locked, setLocked] = useState(false);
  // Word-addressable subtitle view-state + its tap/long-press controller, pushed
  // from the Node-tested SubtitleListPresenter / SubtitleWordActions. The current
  // layout `mode` rides along on `listState.mode`.
  const [listState, setListState] = useState<SubtitleListViewState | null>(null);
  const [wordActions, setWordActions] = useState<SubtitleWordActions | null>(null);
  const subtitleListRef = useRef<PlayerRuntime['subtitleList'] | null>(null);
  // Transport view-state (play/pause · progress · time), pushed from the
  // Node-tested `transport` controller — never computed in this view.
  const [transport, setTransport] = useState<TransportState | null>(null);
  // Fraction being previewed while the user drags the seek bar (null = not
  // scrubbing, so the bar tracks live playback).
  const [scrubFraction, setScrubFraction] = useState<number | null>(null);
  // Kept in refs so the control-bar handlers act on the current playhead
  // without re-rendering on every position tick.
  const controlsRef = useRef<LearningControls | null>(null);
  const transportRef = useRef<TransportControls | null>(null);
  // Measured width of the seek track, so a touch x maps to a position fraction.
  const barWidthRef = useRef(0);
  // Measured size of the gesture pane, so a vertical drag maps to a 0..1 delta.
  const paneWidthRef = useRef(0);
  const paneHeightRef = useRef(0);
  // Per-gesture scratch: which half, the starting levels, and the last tap (for
  // double-tap ±10s detection). Date.now() is fine at this device-shell edge.
  const gestureRef = useRef({ side: 'right' as 'left' | 'right', startVol: 1, startBright: 1 });
  const lastTapRef = useRef<{ t: number; side: 'left' | 'right' } | null>(null);
  // Pending single-tap → play/pause timer. A single tap waits one DOUBLE_TAP_MS
  // window to see if a second tap turns it into a ±10s double-tap; if none comes,
  // it fires as a play/pause toggle (单击视频区域暂停/恢复).
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const surface = useMemo(
    () => surfaceFromRef(videoRef, setUri, setRate, callbacksRef),
    [],
  );

  useEffect(() => {
    setError(null);
    const runtime: PlayerRuntime = createPlayerRuntime({
      surface,
      media,
      document,
      // Only pass provided keys — `exactOptionalPropertyTypes` rejects explicit
      // `undefined` for these optional fields.
      ...(subtitleMode !== undefined && { subtitleMode }),
      ...(subtitleLineCount !== undefined && { subtitleLineCount }),
      ...(wordLookup !== undefined && { wordLookup }),
      ...(wordFavorite !== undefined && { wordFavorite }),
      ...(wordExternalLookup !== undefined && { wordExternalLookup }),
    });
    controlsRef.current = runtime.controls;
    transportRef.current = runtime.transport;
    subtitleListRef.current = runtime.subtitleList;
    setWordActions(runtime.wordActions);
    const off = runtime.presenter.onChange(setOverlay);
    const offTransport = runtime.transport.subscribe(setTransport);
    setTransport(runtime.transport.state());
    // Seed + follow the subtitle-list view-state (connect() doesn't emit an
    // initial snapshot, so prime it from the current state).
    const offList = runtime.subtitleList.onChange(setListState);
    setListState(runtime.subtitleList.state);
    // Drive playback from the player's own lifecycle rather than blindly calling
    // play() after open(): auto-play only once the media is actually `ready`, and
    // surface any load/decode error instead of letting it crash as an illegal
    // "play from error" transition.
    const offEvents = runtime.player.subscribe((event) => {
      if (event.type === 'error') {
        setError(event.message);
      } else if (event.type === 'stateChanged' && event.to === 'ready') {
        // Apply the saved default rate once playable (routes back to setRate).
        if (initialSpeed !== undefined && initialSpeed !== 1) {
          runtime.transport.setSpeed(initialSpeed);
        }
        void runtime.player.play();
      }
    });
    void runtime.open();
    return () => {
      off();
      offTransport();
      offList();
      offEvents();
      controlsRef.current = null;
      transportRef.current = null;
      subtitleListRef.current = null;
      setWordActions(null);
      runtime.dispose();
    };
  }, [
    surface,
    media,
    document,
    subtitleMode,
    subtitleLineCount,
    initialSpeed,
    wordLookup,
    wordFavorite,
    wordExternalLookup,
  ]);

  // Android's hardware back button AND the edge-swipe-back gesture both fire
  // `hardwareBackPress`. Intercept it to return to the home screen instead of
  // killing the app, so the learner can pick another video without a cold
  // restart (was: back gesture exited the app entirely).
  useEffect(() => {
    if (onBack === undefined) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [onBack]);

  // Cancel any pending single-tap play/pause timer when the screen unmounts so a
  // late toggle can't fire against a disposed controller.
  useEffect(
    () => () => {
      if (tapTimerRef.current !== null) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
    },
    [],
  );

  // Read the device's current brightness once so the first drag adjusts from the
  // real value rather than a guessed 1.0 (best-effort; ignored if unavailable).
  useEffect(() => {
    const b = loadBrightness();
    if (b === null) {
      return;
    }
    void b.getBrightnessAsync().then((v) => {
      brightnessRef.current = v;
    }).catch(() => {
      /* keep the default */
    });
  }, []);

  // Lock the current orientation while 锁屏 is on so a stray rotation can't
  // reflow the picture; release it when unlocked (best-effort, module-optional).
  useEffect(() => {
    const o = loadOrientation();
    if (o === null) {
      return;
    }
    if (locked) {
      const lock = isLandscape ? o.OrientationLock.LANDSCAPE : o.OrientationLock.PORTRAIT_UP;
      void o.lockAsync(lock).catch(() => undefined);
    } else {
      void o.unlockAsync().catch(() => undefined);
    }
  }, [locked, isLandscape]);

  // Cycle overlay → list → fullscreen → overlay. The presenter owns the mode;
  // this only nudges it, then re-renders from the emitted view-state.
  const cycleMode = (): void => {
    const current = listState?.mode ?? subtitleMode ?? 'list';
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(current) + 1) % MODE_CYCLE.length]!;
    subtitleListRef.current?.setMode(next);
  };

  const cycleSpeed = (): void => {
    const next = SPEED_CYCLE[(SPEED_CYCLE.indexOf(rate) + 1) % SPEED_CYCLE.length]!;
    transportRef.current?.setSpeed(next);
  };

  const copyActiveLine = (): void => {
    const text = controlsRef.current?.copyActiveLineText({ withTranslation: true });
    if (text !== null && text !== undefined) {
      onCopyText?.(text);
    }
  };

  // Drag-to-seek: convert a touch x on the track into a [0,1] fraction, preview
  // it live while dragging, and commit an absolute seek on release. Uses the
  // built-in PanResponder so no slider dependency is needed. All the clamping /
  // position math lives in the tested `transport` controller.
  const seekPan = useMemo(
    () => {
      const fractionAt = (x: number): number => {
        const w = barWidthRef.current;
        if (w <= 0) return 0;
        return Math.min(1, Math.max(0, x / w));
      };
      const commit = (x: number): void => {
        const t = transportRef.current;
        const state = t?.state();
        if (t && state && state.durationMs > 0) {
          t.seekTo(fractionAt(x) * state.durationMs);
        }
        setScrubFraction(null);
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) =>
          setScrubFraction(fractionAt(e.nativeEvent.locationX)),
        onPanResponderMove: (e) =>
          setScrubFraction(fractionAt(e.nativeEvent.locationX)),
        onPanResponderRelease: (e) => commit(e.nativeEvent.locationX),
        onPanResponderTerminate: (e) => commit(e.nativeEvent.locationX),
      });
    },
    [],
  );

  const onBarLayout = (e: LayoutChangeEvent): void => {
    barWidthRef.current = e.nativeEvent.layout.width;
  };
  const onPaneLayout = (e: LayoutChangeEvent): void => {
    paneWidthRef.current = e.nativeEvent.layout.width;
    paneHeightRef.current = e.nativeEvent.layout.height;
  };

  // Full-video gesture layer (behind the chrome): vertical drag on the LEFT half
  // adjusts brightness, on the RIGHT half adjusts volume; a double-tap on a half
  // seeks ∓10s. Suppressed while locked. The 0..1 math is the tested `nextLevel`.
  const adjustPan = useMemo(
    () => {
      const applyVolume = (v: number): void => {
        volumeRef.current = v;
        setVolume(v);
      };
      const onGrant = (e: GestureResponderEvent): void => {
        const side = e.nativeEvent.locationX < paneWidthRef.current / 2 ? 'left' : 'right';
        gestureRef.current = {
          side,
          startVol: volumeRef.current,
          startBright: brightnessRef.current,
        };
      };
      const onMove = (_e: GestureResponderEvent, g: PanResponderGestureState): void => {
        const track = paneHeightRef.current;
        const up = -g.dy; // screen dy is positive downward; up should increase
        const { side, startVol, startBright } = gestureRef.current;
        if (side === 'right') {
          applyVolume(nextLevel(startVol, up, track));
        } else {
          const level = nextLevel(startBright, up, track);
          brightnessRef.current = level;
          const b = loadBrightness();
          if (b !== null) {
            void b.setBrightnessAsync(level).catch(() => undefined);
          }
        }
      };
      const onRelease = (e: GestureResponderEvent, g: PanResponderGestureState): void => {
        // A small, brief drag counts as a tap → single-tap play/pause vs
        // double-tap ±10s. (A real drag adjusted volume/brightness and returns.)
        if (Math.abs(g.dx) > TAP_SLOP_PX || Math.abs(g.dy) > TAP_SLOP_PX) {
          return;
        }
        const side = e.nativeEvent.locationX < paneWidthRef.current / 2 ? 'left' : 'right';
        const now = Date.now();
        const prev = lastTapRef.current;
        if (prev !== null && prev.side === side && now - prev.t < DOUBLE_TAP_MS) {
          // Second tap of a double-tap → seek; cancel the pending play/pause.
          if (tapTimerRef.current !== null) {
            clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
          }
          transportRef.current?.seekBy(side === 'left' ? -10_000 : 10_000);
          lastTapRef.current = null;
        } else {
          // First tap → arm a play/pause toggle that fires only if no second tap
          // arrives within the double-tap window. This gesture layer covers the
          // VIDEO area only (in list mode it lives inside the video box, above the
          // transcript), so word taps on the subtitle list are never intercepted.
          lastTapRef.current = { t: now, side };
          if (tapTimerRef.current !== null) {
            clearTimeout(tapTimerRef.current);
          }
          tapTimerRef.current = setTimeout(() => {
            transportRef.current?.togglePlay();
            tapTimerRef.current = null;
            lastTapRef.current = null;
          }, DOUBLE_TAP_MS);
        }
      };
      return PanResponder.create({
        onStartShouldSetPanResponder: () => !locked,
        onMoveShouldSetPanResponder: (_e, g) =>
          !locked && Math.abs(g.dy) > Math.abs(g.dx) && Math.abs(g.dy) > 4,
        onPanResponderGrant: onGrant,
        onPanResponderMove: onMove,
        onPanResponderRelease: onRelease,
      });
    },
    [locked],
  );

  // While scrubbing, show the dragged fraction; otherwise follow live playback.
  const shownProgress = scrubFraction ?? transport?.progress ?? 0;
  const shownPositionMs =
    scrubFraction !== null && transport
      ? scrubFraction * transport.durationMs
      : (transport?.positionMs ?? 0);

  const cb = callbacksRef.current;
  const mode: SubtitleDisplayMode = listState?.mode ?? subtitleMode ?? 'list';
  const showSubs = !subsHidden;

  // The video element — identical in every layout; only its wrapper changes.
  const videoEl = uri !== null && (
    <Video
      ref={videoRef}
      // `media.headers` carries the catalog's Bearer token for a token-gated
      // server video (set at the composition root); omitted for external URLs.
      source={{ uri, ...(media.headers ? { headers: media.headers } : {}) }}
      style={styles.video}
      rate={rate}
      volume={volume}
      // Emulators frequently render nothing (black) with the default
      // SurfaceView while audio/progress run fine; TextureView composites
      // reliably inside the RN view tree. `contain` keeps the aspect ratio.
      viewType={ViewType.TEXTURE}
      resizeMode="contain"
      onLoad={(e) => cb?.onLoad({ duration: e.duration, currentTime: e.currentTime })}
      onProgress={(e) => cb?.onProgress({ currentTime: e.currentTime })}
      onSeek={(e) => cb?.onSeek({ currentTime: e.currentTime, seekTime: e.seekTime })}
      onEnd={() => cb?.onEnd()}
      onError={(e) => cb?.onError({ error: { errorString: String(e.error?.errorString) } })}
    />
  );

  // Transparent touch layer over the picture for the volume/brightness/±10s
  // gestures. Rendered before the chrome so the chrome's buttons stay tappable.
  const gestureLayer = uri !== null && (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onPaneLayout}
      {...adjustPan.panHandlers}
    />
  );

  // The word-addressable transcript (list) / windowed strip (fullscreen). Painted
  // only when its controller is wired AND subtitles aren't hidden; overlay mode
  // uses <SubtitleOverlay>.
  const subtitleListEl =
    showSubs && wordActions !== null && listState !== null ? (
      <SubtitleList
        state={listState}
        actions={wordActions}
        {...(onFavorited !== undefined && { onFavorited })}
      />
    ) : null;

  const chrome = (
    <PlayerChrome
      topInset={topInset}
      error={error}
      locked={locked}
      onToggleLock={() => setLocked((v) => !v)}
      {...(onBack !== undefined && { onBack })}
      mode={mode}
      modeLabel={MODE_LABEL[mode]}
      onCycleMode={cycleMode}
      speed={rate}
      onCycleSpeed={cycleSpeed}
      subsHidden={subsHidden}
      onToggleSubs={() => setSubsHidden((v) => !v)}
      transport={transport}
      shownProgress={shownProgress}
      shownPositionMs={shownPositionMs}
      onTogglePlay={() => transportRef.current?.togglePlay()}
      onSeekBy={(d) => transportRef.current?.seekBy(d)}
      seekPanHandlers={seekPan.panHandlers}
      onBarLayout={onBarLayout}
      onStepPrev={() => controlsRef.current?.stepWord('prev')}
      onStepNext={() => controlsRef.current?.stepWord('next')}
      onCopy={copyActiveLine}
    />
  );

  // List mode splits video and transcript so BOTH are always visible:
  //  • portrait  → video in a 16:9 box on top, transcript fills the rest below.
  //  • landscape → video (flex:2) on the LEFT, transcript (flex:1) on the RIGHT.
  // Overlay / fullscreen keep the video full-bleed with subtitles floating over
  // the picture, which already works in both orientations.
  if (mode === 'list') {
    if (isLandscape) {
      return (
        <View style={styles.containerRow}>
          <View style={styles.videoPaneLandscape}>
            {videoEl}
            {gestureLayer}
            {chrome}
          </View>
          <View style={styles.listPaneLandscape}>{subtitleListEl}</View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <View style={styles.videoBoxList}>
          {videoEl}
          {gestureLayer}
          {chrome}
        </View>
        {subtitleListEl}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoEl}
      {gestureLayer}
      {mode === 'overlay' && showSubs && <SubtitleOverlay state={overlay} />}
      {mode === 'fullscreen' && subtitleListEl}
      {chrome}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  // Landscape list: video and transcript sit side by side.
  containerRow: { flex: 1, flexDirection: 'row', backgroundColor: 'black' },
  // Left video pane (landscape list) — the picture fills it, bars float over it.
  videoPaneLandscape: { flex: 2, position: 'relative', backgroundColor: 'black' },
  // Right transcript pane (landscape list) — always on-screen alongside the video.
  listPaneLandscape: { flex: 1, backgroundColor: '#0d0d0f' },
  // Fill the container as a flex child. Under the New Architecture (Fabric)
  // interop, `react-native-video`'s native view does NOT resolve
  // `absoluteFillObject`'s top/bottom insets to a concrete height — it lays out
  // at height 0 (audio/progress run, but nothing is drawn). `flex: 1` gives it a
  // definite measured size from the parent instead.
  video: { flex: 1 },
  // Portrait-list layout: a fixed 16:9 video box at the top; the bars are
  // absolutely positioned inside it so they float over the picture, and the
  // transcript below gets all remaining height.
  videoBoxList: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'black',
    position: 'relative',
  },
});
