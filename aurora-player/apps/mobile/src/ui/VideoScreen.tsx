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
// here — that all sits in the Node-tested core.
//
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Video, { ViewType, type VideoRef } from 'react-native-video';
import {
  createPlayerRuntime,
  formatClock,
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
 * core owns the seconds↔ms boundary.
 */
const surfaceFromRef = (
  ref: React.RefObject<VideoRef | null>,
  setUri: (uri: string | null) => void,
  callbacksRef: React.MutableRefObject<NativeVideoCallbacks | null>,
): NativeVideoSurface => ({
  commands: {
    load: (uri) => setUri(uri),
    play: () => ref.current?.resume(),
    pause: () => ref.current?.pause(),
    seek: (positionSec) => ref.current?.seek(positionSec),
    setRate: () => {
      // Rate is applied declaratively via the <Video rate={...}> prop; a real
      // binding would lift it into state. Omitted here for brevity.
    },
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
  const videoRef = useRef<VideoRef | null>(null);
  const callbacksRef = useRef<NativeVideoCallbacks | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayViewState | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const surface = useMemo(
    () => surfaceFromRef(videoRef, setUri, callbacksRef),
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
    wordLookup,
    wordFavorite,
    wordExternalLookup,
  ]);

  // Cycle overlay → list → fullscreen → overlay. The presenter owns the mode;
  // this only nudges it, then re-renders from the emitted view-state.
  const cycleMode = (): void => {
    const current = listState?.mode ?? subtitleMode ?? 'list';
    const next = MODE_CYCLE[(MODE_CYCLE.indexOf(current) + 1) % MODE_CYCLE.length]!;
    subtitleListRef.current?.setMode(next);
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
        const width = barWidthRef.current;
        if (width <= 0) return 0;
        return Math.min(1, Math.max(0, x / width));
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

  // While scrubbing, show the dragged fraction; otherwise follow live playback.
  const shownProgress = scrubFraction ?? transport?.progress ?? 0;
  const shownPositionMs =
    scrubFraction !== null && transport
      ? scrubFraction * transport.durationMs
      : (transport?.positionMs ?? 0);

  const cb = callbacksRef.current;
  const mode: SubtitleDisplayMode = listState?.mode ?? subtitleMode ?? 'list';

  // The video element — identical in every layout; only its wrapper changes.
  const videoEl = uri !== null && (
    <Video
      ref={videoRef}
      source={{ uri }}
      style={styles.video}
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

  // ⤢ cycles the subtitle layout; the label shows the current mode.
  const modeToggle = (
    <TouchableOpacity style={styles.modeToggle} onPress={cycleMode}>
      <Text style={styles.modeToggleLabel}>⤢ {MODE_LABEL[mode]}</Text>
    </TouchableOpacity>
  );

  // Optional "back to home" pill (top-left), only when a home screen is wired.
  const backButton = onBack !== undefined && (
    <TouchableOpacity style={styles.backButton} onPress={onBack}>
      <Text style={styles.modeToggleLabel}>‹ 返回</Text>
    </TouchableOpacity>
  );

  // The word-addressable transcript (list) / windowed strip (fullscreen). Painted
  // only when its controller is wired; overlay mode uses <SubtitleOverlay>.
  const subtitleListEl =
    wordActions !== null && listState !== null ? (
      <SubtitleList
        state={listState}
        actions={wordActions}
        {...(onFavorited !== undefined && { onFavorited })}
      />
    ) : null;

  const transportBar = (
    // Transport bar — play/pause · seek · time. Pure view: it renders the
    // `transport` snapshot and forwards taps/drags to the Node-tested controller.
    <View style={styles.transportBar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.playButton}
        disabled={transport?.canPlay !== true}
        onPress={() => transportRef.current?.togglePlay()}
      >
        <Text style={styles.playLabel}>
          {transport?.playing === true ? '❚❚' : '►'}
        </Text>
      </TouchableOpacity>
      <Text style={styles.timeLabel}>{formatClock(shownPositionMs)}</Text>
      <View style={styles.seekTrack} onLayout={onBarLayout} {...seekPan.panHandlers}>
        <View style={[styles.seekFill, { width: `${shownProgress * 100}%` }]} />
        <View style={[styles.seekThumb, { left: `${shownProgress * 100}%` }]} />
      </View>
      <Text style={styles.timeLabel}>{formatClock(transport?.durationMs ?? 0)}</Text>
    </View>
  );

  const controlBar = (
    // Epic A learning gestures — thin buttons that only call `runtime.controls`.
    <View style={styles.controlBar} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.controlButton}
        onPress={() => controlsRef.current?.stepWord('prev')}
      >
        <Text style={styles.controlLabel}>◀ 词</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.controlButton} onPress={copyActiveLine}>
        <Text style={styles.controlLabel}>复制</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.controlButton}
        onPress={() => controlsRef.current?.stepWord('next')}
      >
        <Text style={styles.controlLabel}>词 ▶</Text>
      </TouchableOpacity>
    </View>
  );

  const errorBanner = error !== null && (
    <View style={styles.errorBanner} pointerEvents="none">
      <Text style={styles.errorText}>Playback error: {error}</Text>
    </View>
  );

  // List mode splits video and transcript so BOTH are always visible:
  //  • portrait  → video in a 16:9 box on top, transcript fills the rest below
  //    (用户要求：视频最上方 + 下面一排排字幕列表).
  //  • landscape → video (flex:2) on the LEFT, transcript (flex:1) on the RIGHT,
  //    so a 16:9 box can't push the subtitles off-screen (横屏也能看字幕).
  // Overlay / fullscreen keep the video full-bleed with subtitles floating over
  // the picture, which already works in both orientations.
  if (mode === 'list') {
    if (isLandscape) {
      return (
        <View style={styles.containerRow}>
          <View style={styles.videoPaneLandscape}>
            {videoEl}
            {backButton}
            {modeToggle}
            {transportBar}
            {controlBar}
            {errorBanner}
          </View>
          <View style={styles.listPaneLandscape}>{subtitleListEl}</View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <View style={styles.videoBoxList}>
          {videoEl}
          {backButton}
          {modeToggle}
          {transportBar}
          {controlBar}
          {errorBanner}
        </View>
        {subtitleListEl}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoEl}
      {mode === 'overlay' && <SubtitleOverlay state={overlay} />}
      {mode === 'fullscreen' && subtitleListEl}
      {backButton}
      {modeToggle}
      {transportBar}
      {controlBar}
      {errorBanner}
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
  // Small pill (top-right) to cycle subtitle layout modes.
  modeToggle: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modeToggleLabel: { color: 'white', fontSize: 13 },
  // Small pill (top-left) to return to the URL/home screen.
  backButton: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  errorBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    padding: 16,
    backgroundColor: 'rgba(180,0,0,0.85)',
  },
  errorText: { color: 'white', fontSize: 14, textAlign: 'center' },
  transportBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  playLabel: { color: 'white', fontSize: 16 },
  timeLabel: {
    color: 'white',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    minWidth: 44,
    textAlign: 'center',
  },
  seekTrack: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4da3ff',
  },
  seekThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: 'white',
  },
  controlBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  controlButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  controlLabel: { color: 'white', fontSize: 16 },
});
