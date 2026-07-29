//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// Settings screen (Epic ③): manage network consent, read the data-processing
// disclosure, clear playback history, and choose default subtitle mode / speed.
// A DUMB view — it renders the consent state, the static disclosure manifest and
// the current prefs, and forwards every change to props. The actual consent
// grant/revoke, persistence and history clearing live in the Node-tested core
// wired by App.tsx (`isGranted`/`withConsent`, `PlayerPreferences`, `RecentSources
// .clear`). It IS linted (ESLint covers `**/*.tsx`).
//
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  DEFAULT_PROCESSING_MANIFEST,
  disclosedUses,
  isGranted,
  type ConsentState,
  type PlayerPrefsData,
  type SubtitleDisplayMode,
} from '../index.js';

// Choices offered by the two default pickers (labels localized here, values are
// the core's own types/band).
const MODE_OPTIONS: readonly { readonly value: SubtitleDisplayMode; readonly label: string }[] = [
  { value: 'overlay', label: '单行' },
  { value: 'list', label: '列表' },
  { value: 'fullscreen', label: '全屏' },
];
const SPEED_OPTIONS: readonly number[] = [0.75, 1, 1.25, 1.5, 2];

export interface SettingsScreenProps {
  /** Current consent state (the network row drives the toggle). */
  readonly consent: ConsentState;
  /** Grant/revoke `network` consent (App applies `withConsent` + persists). */
  readonly onSetNetworkConsent: (granted: boolean) => void;
  /** Current default playback prefs. */
  readonly prefs: PlayerPrefsData;
  readonly onSetSubtitleMode: (mode: SubtitleDisplayMode) => void;
  readonly onSetSpeed: (speed: number) => void;
  /** Number of remembered sources (shown on the clear button). */
  readonly historyCount: number;
  readonly onClearHistory: () => void;
  /** Optional "back to home" affordance; omitted when a tab bar handles nav. */
  readonly onBack?: () => void;
}

/** Settings: consent · privacy disclosure · clear history · defaults. */
export function SettingsScreen({
  consent,
  onSetNetworkConsent,
  prefs,
  onSetSubtitleMode,
  onSetSpeed,
  historyCount,
  onClearHistory,
  onBack,
}: SettingsScreenProps): React.JSX.Element {
  const networkGranted = isGranted(consent, 'network');
  const uses = disclosedUses(DEFAULT_PROCESSING_MANIFEST);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {onBack !== undefined ? (
          <Pressable style={styles.headerBtn} onPress={onBack}>
            <Text style={styles.headerBtnLabel}>‹ 返回</Text>
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
        <Text style={styles.title}>设置</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 联网同意管理 */}
        <Text style={styles.section}>联网同意</Text>
        <View style={styles.rowBetween}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>允许联网播放</Text>
            <Text style={styles.rowHint}>
              {networkGranted ? '已允许 — 可播放在线视频/市场资源' : '未允许 — 仅本机内容可播放'}
            </Text>
          </View>
          <Switch value={networkGranted} onValueChange={onSetNetworkConsent} />
        </View>

        {/* 隐私·数据说明 */}
        <Text style={styles.section}>数据说明</Text>
        <Text style={styles.rowHint}>
          涉及的数据类别：{uses.length > 0 ? uses.join('、') : '无'}
        </Text>
        {DEFAULT_PROCESSING_MANIFEST.map((r) => (
          <View key={r.capability} style={styles.card}>
            <Text style={styles.cardTitle}>{r.capability}</Text>
            <Text style={styles.cardBody}>{r.purpose}</Text>
            <Text style={styles.cardMeta}>
              用途：{r.uses.length > 0 ? r.uses.join('、') : '无'}
              {'   '}
              保留：{r.retentionDays === undefined ? '不保留' : `${r.retentionDays} 天`}
            </Text>
          </View>
        ))}

        {/* 默认字幕模式 */}
        <Text style={styles.section}>默认字幕模式</Text>
        <View style={styles.segment}>
          {MODE_OPTIONS.map((o) => {
            const active = prefs.subtitleMode === o.value;
            return (
              <Pressable
                key={o.value}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => onSetSubtitleMode(o.value)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 默认倍速 */}
        <Text style={styles.section}>默认倍速</Text>
        <View style={styles.segment}>
          {SPEED_OPTIONS.map((sp) => {
            const active = prefs.speed === sp;
            return (
              <Pressable
                key={sp}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                onPress={() => onSetSpeed(sp)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                  {sp}x
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* 清除播放历史 */}
        <Text style={styles.section}>播放历史</Text>
        <Pressable
          style={[styles.dangerBtn, historyCount === 0 && styles.dangerBtnDisabled]}
          disabled={historyCount === 0}
          onPress={onClearHistory}
        >
          <Text style={styles.dangerLabel}>
            {historyCount === 0 ? '暂无播放历史' : `清除播放历史（${historyCount} 条）`}
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f', padding: 20, paddingTop: 56 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { minWidth: 64, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  headerBtnLabel: { color: '#e6e6e6', fontSize: 15 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  scroll: { paddingVertical: 12, gap: 8 },
  section: { color: '#9aa0aa', fontSize: 13, marginTop: 16, marginBottom: 4, fontWeight: '600' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141419',
    borderRadius: 10,
    padding: 12,
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowTitle: { color: '#e6e6e6', fontSize: 15, fontWeight: '600' },
  rowHint: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  card: { backgroundColor: '#141419', borderRadius: 10, padding: 12, gap: 4 },
  cardTitle: { color: '#e6e6e6', fontSize: 14, fontWeight: '700' },
  cardBody: { color: '#c9c9c9', fontSize: 13, lineHeight: 18 },
  cardMeta: { color: '#6b7280', fontSize: 12 },
  segment: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  segmentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#141419',
  },
  segmentBtnActive: { backgroundColor: '#4da3ff' },
  segmentLabel: { color: '#e6e6e6', fontSize: 14 },
  segmentLabelActive: { color: '#04101f', fontWeight: '700' },
  dangerBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(200,60,60,0.18)',
    alignItems: 'center',
  },
  dangerBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.06)' },
  dangerLabel: { color: '#ff8080', fontSize: 15, fontWeight: '600' },
});
