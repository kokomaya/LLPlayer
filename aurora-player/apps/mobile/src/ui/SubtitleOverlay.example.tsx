//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT COMPILED / TESTED / LINTED IN CI. ⚠️
//
// Excluded from the graph for the same reasons as VideoScreen.example.tsx (see
// its header). This is a DUMB component (plan/04): it renders an
// {@link OverlayViewState} and contains no timing/subtitle logic — every sync
// decision was made by the Node-tested `SubtitleOverlayPresenter`. Estimated
// (interpolated) words are rendered without the per-word highlight so users can
// tell real word timings from guessed ones.
//
import { StyleSheet, Text, View } from 'react-native';
import type { OverlayViewState } from '@aurora/presentation';

export interface SubtitleOverlayProps {
  readonly state: OverlayViewState | null;
}

export function SubtitleOverlay({ state }: SubtitleOverlayProps): React.JSX.Element | null {
  if (state === null || state.line === null) {
    return null;
  }
  const { line, word, estimated } = state;
  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.line}>
        {word === null ? (
          line
        ) : (
          <Text style={estimated ? styles.wordEstimated : styles.word}>{word}</Text>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  line: { color: 'white', fontSize: 22, textAlign: 'center' },
  word: { color: '#ffd54f', fontWeight: '700' },
  wordEstimated: { color: 'white', fontStyle: 'italic' },
});
