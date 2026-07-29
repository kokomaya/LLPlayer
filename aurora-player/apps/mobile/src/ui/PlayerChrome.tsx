//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// Same status as VideoScreen.tsx: `tsc` never sees `.tsx` and vitest excludes
// `src/ui/**`, so this is type-validated on device via Expo/Metro; it IS linted.
//
// Purely presentational chrome for the player — the floating pills and bars that
// sit over the picture (返回 / 模式 / 倍速 / 字幕 / 锁 / transport ±10s / learning
// row). It owns ZERO playback logic: every value is a prop and every gesture is a
// callback, so VideoScreen keeps all the runtime wiring and this file stays a thin
// view that can grow buttons without bloating the screen. Extracted from
// VideoScreen to keep both files within the line budget (①.F.20).
//
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type GestureResponderHandlers,
  type LayoutChangeEvent,
} from 'react-native';
import { formatClock, type SubtitleDisplayMode, type TransportState } from '../index.js';

export interface PlayerChromeProps {
  /** Status-bar height so top pills clear the system clock/battery icons. */
  readonly topInset: number;
  /** Current playback error message, shown as a top banner (null = none). */
  readonly error: string | null;

  /** When locked, only a single unlock pill is shown (防误触). */
  readonly locked: boolean;
  readonly onToggleLock: () => void;

  /** Optional "back to home" affordance (top-left). */
  readonly onBack?: () => void;

  /** Current subtitle layout + its localized label, and the cycle action. */
  readonly mode: SubtitleDisplayMode;
  readonly modeLabel: string;
  readonly onCycleMode: () => void;

  /** Current playback rate and the "cycle to next rate" action. */
  readonly speed: number;
  readonly onCycleSpeed: () => void;

  /** Whether subtitles are hidden, and the toggle. */
  readonly subsHidden: boolean;
  readonly onToggleSubs: () => void;

  /** Transport snapshot + the scrub preview values computed by the screen. */
  readonly transport: TransportState | null;
  readonly shownProgress: number;
  readonly shownPositionMs: number;
  readonly onTogglePlay: () => void;
  /** Relative seek in ms (±10s buttons); the screen forwards to the controller. */
  readonly onSeekBy: (deltaMs: number) => void;
  readonly seekPanHandlers: GestureResponderHandlers;
  readonly onBarLayout: (e: LayoutChangeEvent) => void;

  /** Epic A learning-gesture callbacks (word step + copy). */
  readonly onStepPrev: () => void;
  readonly onStepNext: () => void;
  readonly onCopy: () => void;
}

/** Floating controls over the picture. See {@link PlayerChromeProps}. */
export function PlayerChrome(props: PlayerChromeProps): React.JSX.Element {
  const {
    topInset,
    error,
    locked,
    onToggleLock,
    onBack,
    modeLabel,
    onCycleMode,
    speed,
    onCycleSpeed,
    subsHidden,
    onToggleSubs,
    transport,
    shownProgress,
    shownPositionMs,
    onTogglePlay,
    onSeekBy,
    seekPanHandlers,
    onBarLayout,
    onStepPrev,
    onStepNext,
    onCopy,
  } = props;

  const errorBanner = error !== null && (
    <View style={[styles.errorBanner, { paddingTop: 16 + topInset }]} pointerEvents="none">
      <Text style={styles.errorText}>Playback error: {error}</Text>
    </View>
  );

  // Locked: hide everything except a single unlock pill so an accidental touch
  // can't seek/scrub/rotate during viewing (锁屏防误触).
  if (locked) {
    return (
      <>
        {errorBanner}
        <TouchableOpacity
          style={[styles.lockOnly, { top: 12 + topInset }]}
          hitSlop={12}
          onPress={onToggleLock}
        >
          <Text style={styles.pillLabel}>🔒</Text>
        </TouchableOpacity>
      </>
    );
  }

  return (
    <>
      {onBack !== undefined && (
        <TouchableOpacity
          style={[styles.backButton, { top: 12 + topInset }]}
          hitSlop={8}
          onPress={onBack}
        >
          <Text style={styles.pillLabel}>‹ 返回</Text>
        </TouchableOpacity>
      )}

      {/* Top-right cluster: 倍速 · 字幕 · 锁 · 模式. */}
      <View style={[styles.topRight, { top: 12 + topInset }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.pill} hitSlop={6} onPress={onCycleSpeed}>
          <Text style={styles.pillLabel}>{speed}x</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} hitSlop={6} onPress={onToggleSubs}>
          <Text style={styles.pillLabel}>{subsHidden ? '字幕关' : '字幕开'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} hitSlop={6} onPress={onToggleLock}>
          <Text style={styles.pillLabel}>🔓</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.pill} hitSlop={6} onPress={onCycleMode}>
          <Text style={styles.pillLabel}>⤢ {modeLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Transport: ⏪10 · play · time · seek · time · ⏩10. */}
      <View style={styles.transportBar} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.skipButton}
          hitSlop={6}
          onPress={() => onSeekBy(-10_000)}
        >
          <Text style={styles.skipLabel}>⏪10</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.playButton}
          disabled={transport?.canPlay !== true}
          onPress={onTogglePlay}
        >
          <Text style={styles.playLabel}>{transport?.playing === true ? '❚❚' : '►'}</Text>
        </TouchableOpacity>
        <Text style={styles.timeLabel}>{formatClock(shownPositionMs)}</Text>
        <View style={styles.seekTrack} onLayout={onBarLayout} {...seekPanHandlers}>
          <View style={[styles.seekFill, { width: `${shownProgress * 100}%` }]} />
          <View style={[styles.seekThumb, { left: `${shownProgress * 100}%` }]} />
        </View>
        <Text style={styles.timeLabel}>{formatClock(transport?.durationMs ?? 0)}</Text>
        <TouchableOpacity
          style={styles.skipButton}
          hitSlop={6}
          onPress={() => onSeekBy(10_000)}
        >
          <Text style={styles.skipLabel}>10⏩</Text>
        </TouchableOpacity>
      </View>

      {/* Learning row — word step + copy (Epic A). */}
      <View style={styles.controlBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.controlButton} onPress={onStepPrev}>
          <Text style={styles.controlLabel}>◀ 词</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={onCopy}>
          <Text style={styles.controlLabel}>复制</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={onStepNext}>
          <Text style={styles.controlLabel}>词 ▶</Text>
        </TouchableOpacity>
      </View>

      {errorBanner}
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  pillLabel: { color: 'white', fontSize: 13 },
  topRight: {
    position: 'absolute',
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  backButton: {
    position: 'absolute',
    left: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  lockOnly: {
    position: 'absolute',
    right: 12,
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
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  skipButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  skipLabel: { color: 'white', fontSize: 12 },
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
  seekTrack: { flex: 1, height: 24, justifyContent: 'center' },
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
