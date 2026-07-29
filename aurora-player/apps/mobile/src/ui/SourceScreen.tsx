//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// Home screen for "Stream Online Videos" (Epic A · aligns with SubX). A DUMB
// controlled view: it renders a URL field + a history/favorites list and
// forwards every intent to props. All validation, consent-gating and
// persistence live in the Node-tested core (`parseUrlSource`, `decidePlayback`,
// `createRecentSources`) wired by App.tsx — this leaf holds no such logic. It IS
// linted (ESLint covers `**/*.tsx`); `react` / `react-native` are device-only.
//
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { RecentSource } from '../index.js';
import { ConsentSheet } from './ConsentSheet.js';

export interface SourceScreenProps {
  /** Current URL text (controlled). */
  readonly urlText: string;
  readonly onChangeUrl: (text: string) => void;
  /** Submit the typed URL for validation + consent-gated playback. */
  readonly onSubmitUrl: () => void;
  /** Validation / consent message to show under the field (null = none). */
  readonly error: string | null;
  /** Remembered sources, most-recent first (favorites float to the top group). */
  readonly recent: readonly RecentSource[];
  readonly onReplay: (source: RecentSource) => void;
  readonly onRename: (source: RecentSource, title: string) => void;
  readonly onToggleFavorite: (source: RecentSource) => void;
  readonly onRemove: (source: RecentSource) => void;
  /** When set, the on-device demo clip is playable from a shortcut button. */
  readonly deviceDemo?: { readonly title: string; readonly onPlay: () => void } | null;
  /** When set, an online video+subtitle demo is playable from a shortcut button. */
  readonly onlineDemo?: { readonly title: string; readonly onPlay: () => void } | null;
  /** When true, show the "allow network playback?" consent sheet. */
  readonly consentPrompt: boolean;
  readonly onGrantConsent: () => void;
  readonly onDismissConsent: () => void;
}

/** The URL home: type/paste a link, replay history, manage favorites. */
export function SourceScreen({
  urlText,
  onChangeUrl,
  onSubmitUrl,
  error,
  recent,
  onReplay,
  onRename,
  onToggleFavorite,
  onRemove,
  deviceDemo,
  onlineDemo,
  consentPrompt,
  onGrantConsent,
  onDismissConsent,
}: SourceScreenProps): React.JSX.Element {
  const [renaming, setRenaming] = useState<RecentSource | null>(null);
  const favorites = recent.filter((s) => s.favorite);
  const history = recent.filter((s) => !s.favorite);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aurora Player</Text>
      <Text style={styles.subtitle}>输入视频链接直接播放（支持 http/https、HLS .m3u8）</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={urlText}
          onChangeText={onChangeUrl}
          onSubmitEditing={onSubmitUrl}
          placeholder="https://…/video.mp4"
          placeholderTextColor="#6b7280"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <Pressable style={styles.playBtn} onPress={onSubmitUrl}>
          <Text style={styles.playBtnLabel}>播放</Text>
        </Pressable>
      </View>
      {error !== null && <Text style={styles.error}>{error}</Text>}

      {deviceDemo != null && (
        <Pressable style={styles.demoBtn} onPress={deviceDemo.onPlay}>
          <Text style={styles.demoLabel}>▶ 播放本机示例：{deviceDemo.title}</Text>
        </Pressable>
      )}

      {onlineDemo != null && (
        <Pressable style={styles.demoBtn} onPress={onlineDemo.onPlay}>
          <Text style={styles.demoLabel}>▶ {onlineDemo.title}（带字幕）</Text>
        </Pressable>
      )}

      <FlatList
        style={styles.list}
        data={[...favorites, ...history]}
        keyExtractor={(s) => s.uri}
        ListHeaderComponent={
          recent.length > 0 ? <Text style={styles.section}>最近 / 收藏</Text> : null
        }
        ListEmptyComponent={<Text style={styles.empty}>还没有播放记录</Text>}
        renderItem={({ item }) => (
          <RecentRow
            source={item}
            onReplay={() => onReplay(item)}
            onRename={() => setRenaming(item)}
            onToggleFavorite={() => onToggleFavorite(item)}
            onRemove={() => onRemove(item)}
          />
        )}
      />

      {renaming !== null && (
        <RenameSheet
          source={renaming}
          onCancel={() => setRenaming(null)}
          onSubmit={(title) => {
            onRename(renaming, title);
            setRenaming(null);
          }}
        />
      )}

      {consentPrompt && (
        <ConsentSheet onGrant={onGrantConsent} onDismiss={onDismissConsent} />
      )}
    </View>
  );
}

function RecentRow({
  source,
  onReplay,
  onRename,
  onToggleFavorite,
  onRemove,
}: {
  readonly source: RecentSource;
  readonly onReplay: () => void;
  readonly onRename: () => void;
  readonly onToggleFavorite: () => void;
  readonly onRemove: () => void;
}): React.JSX.Element {
  return (
    <Pressable style={styles.row} onPress={onReplay} onLongPress={onRename}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {source.title}
        </Text>
        <Text style={styles.rowUri} numberOfLines={1}>
          {source.uri}
        </Text>
      </View>
      <Pressable style={styles.rowIcon} onPress={onToggleFavorite}>
        <Text style={styles.rowIconLabel}>{source.favorite ? '★' : '☆'}</Text>
      </Pressable>
      <Pressable style={styles.rowIcon} onPress={onRemove}>
        <Text style={styles.rowIconLabel}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

function RenameSheet({
  source,
  onCancel,
  onSubmit,
}: {
  readonly source: RecentSource;
  readonly onCancel: () => void;
  readonly onSubmit: (title: string) => void;
}): React.JSX.Element {
  const [text, setText] = useState(source.title);
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.cardTitle}>重命名</Text>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            autoFocus
            selectTextOnFocus
          />
          <View style={styles.cardActions}>
            <Pressable style={styles.cardBtn} onPress={onCancel}>
              <Text style={styles.cardBtnLabel}>取消</Text>
            </Pressable>
            <Pressable style={styles.cardBtn} onPress={() => onSubmit(text.trim() || source.title)}>
              <Text style={styles.cardBtnLabel}>保存</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f', padding: 20, paddingTop: 56, gap: 12 },
  title: { color: '#fff', fontSize: 26, fontWeight: '700' },
  subtitle: { color: '#9aa0aa', fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    backgroundColor: '#1c1c22',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  playBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4da3ff',
  },
  playBtnLabel: { color: '#04101f', fontSize: 15, fontWeight: '700' },
  error: { color: '#ff8080', fontSize: 13 },
  demoBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  demoLabel: { color: '#e6e6e6', fontSize: 14 },
  list: { flex: 1, marginTop: 6 },
  section: { color: '#9aa0aa', fontSize: 13, marginBottom: 8 },
  empty: { color: '#6b7280', fontSize: 14, marginTop: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#141419',
    marginBottom: 8,
  },
  rowText: { flex: 1 },
  rowTitle: { color: '#e6e6e6', fontSize: 15, fontWeight: '600' },
  rowUri: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  rowIcon: { padding: 6 },
  rowIconLabel: { color: '#ffd54f', fontSize: 18 },

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
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cardBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  cardBtnLabel: { color: 'white', fontSize: 15 },
});
