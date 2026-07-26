//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT COMPILED / TESTED / LINTED IN CI. ⚠️
//
// This file is intentionally excluded from the project graph:
//   • tsconfig.json `include` is `src/**/*.ts` (no .tsx)
//   • eslint.config.mjs ignores `**/*.example.tsx`
//   • vitest coverage excludes `src/**/*.example.*`
// because `react`, `react-native`, and `react-native-video` are NOT installed
// in this repo (they are heavy device-only deps). To ship on a device, follow
// README.md: install those libs, then copy this file to `VideoScreen.tsx` and
// drop the `.example` from its imports.
//
// It is the THIN native leaf of the ports-&-adapters design (plan/04): all it
// does is adapt the imperative `react-native-video` `<Video ref>` handle to the
// pure `NativeVideoSurface` port, then hand that surface to the pure
// `createPlayerRuntime` composition root. Zero playback/subtitle logic lives
// here — that all sits in the Node-tested core.
//
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Video, { ViewType, type VideoRef } from 'react-native-video';
import {
  createPlayerRuntime,
  type LearningControls,
  type PlayerRuntime,
} from '../index.js';
import type {
  NativeVideoCallbacks,
  NativeVideoSurface,
} from '../adapters/native-video-surface.js';
import type { MediaSource } from '@aurora/player-api';
import type { SubtitleDocument } from '@aurora/subtitle';
import { SubtitleOverlay } from './SubtitleOverlay.js';
import type { OverlayViewState } from '@aurora/presentation';

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
}: VideoScreenProps): React.JSX.Element {
  const videoRef = useRef<VideoRef | null>(null);
  const callbacksRef = useRef<NativeVideoCallbacks | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OverlayViewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Kept in a ref so the control-bar handlers act on the current playhead
  // without re-rendering on every position tick.
  const controlsRef = useRef<LearningControls | null>(null);

  const surface = useMemo(
    () => surfaceFromRef(videoRef, setUri, callbacksRef),
    [],
  );

  useEffect(() => {
    setError(null);
    const runtime: PlayerRuntime = createPlayerRuntime({ surface, media, document });
    controlsRef.current = runtime.controls;
    const off = runtime.presenter.onChange(setOverlay);
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
      offEvents();
      controlsRef.current = null;
      runtime.dispose();
    };
  }, [surface, media, document]);

  const copyActiveLine = (): void => {
    const text = controlsRef.current?.copyActiveLineText({ withTranslation: true });
    if (text !== null && text !== undefined) {
      onCopyText?.(text);
    }
  };

  const cb = callbacksRef.current;
  return (
    <View style={styles.container}>
      {uri !== null && (
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
      )}
      <SubtitleOverlay state={overlay} />
      {/* Epic A learning gestures — thin buttons that only call
          `runtime.controls`; all logic lives in the Node-tested core. */}
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
      {error !== null && (
        <View style={styles.errorBanner} pointerEvents="none">
          <Text style={styles.errorText}>Playback error: {error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'black' },
  // Fill the container as a flex child. Under the New Architecture (Fabric)
  // interop, `react-native-video`'s native view does NOT resolve
  // `absoluteFillObject`'s top/bottom insets to a concrete height — it lays out
  // at height 0 (audio/progress run, but nothing is drawn). `flex: 1` gives it a
  // definite measured size from the parent instead.
  video: { flex: 1 },
  errorBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    padding: 16,
    backgroundColor: 'rgba(180,0,0,0.85)',
  },
  errorText: { color: 'white', fontSize: 14, textAlign: 'center' },
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
