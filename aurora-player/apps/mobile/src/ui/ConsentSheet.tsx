//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// The "allow network playback?" consent sheet, shared by the URL home
// (SourceScreen) and the marketplace (MarketScreen). Extracted so both entry
// points show the SAME dialog and the SAME copy — the actual grant/deny decision
// and its persistence live in the Node-tested consent gate wired by App.tsx; this
// is a dumb modal that only calls back. It IS linted (ESLint covers `**/*.tsx`).
//
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export interface ConsentSheetProps {
  /** User allowed network playback (App.tsx records + persists the grant). */
  readonly onGrant: () => void;
  /** User dismissed without granting (no network request is made). */
  readonly onDismiss: () => void;
}

/** Modal asking permission before any network request is made. */
export function ConsentSheet({ onGrant, onDismiss }: ConsentSheetProps): React.JSX.Element {
  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.cardTitle}>允许联网播放？</Text>
          <Text style={styles.cardBody}>
            播放在线视频需要访问网络。仅在你允许后才会发起网络请求，此选择会被记住。
          </Text>
          <View style={styles.cardActions}>
            <Pressable style={styles.cardBtn} onPress={onDismiss}>
              <Text style={styles.cardBtnLabel}>取消</Text>
            </Pressable>
            <Pressable style={styles.cardBtn} onPress={onGrant}>
              <Text style={styles.cardBtnLabel}>允许</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: '#1c1c1f',
    padding: 16,
    gap: 12,
  },
  cardTitle: { color: 'white', fontSize: 18, fontWeight: '700' },
  cardBody: { color: '#c9c9c9', fontSize: 14, lineHeight: 20 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardBtnLabel: { color: 'white', fontSize: 15 },
});
