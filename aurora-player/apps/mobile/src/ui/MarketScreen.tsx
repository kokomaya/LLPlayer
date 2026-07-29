//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// Media marketplace browse/detail/play screen (Epic C · 媒体市场). A DUMB view:
// it renders whatever the Node-tested `MarketplaceControls` returns and forwards
// every intent back through them. It holds NO catalog, consent or playback logic
// — `browse/openPackage/playPackage` decide everything, and network access is
// gated by the shared consent gate (rule ①.F.22), reusing the same ConsentSheet
// the URL home shows. It IS linted (ESLint covers `**/*.tsx`).
//
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConsentState, MediaPackage, MediaPackageSummary } from '@aurora/domain';
import type { MediaSource } from '@aurora/player-api';
import { formatClock, type MarketplaceControls } from '../index.js';
import { ConsentSheet } from './ConsentSheet.js';

/**
 * The subtitle track a player should fetch for `pkg`: a word-level track that
 * declares a `uri` if any, otherwise the first track with a `uri`, otherwise
 * `undefined` (nothing to fetch — plays with an empty document, as before).
 */
const pickSubtitleUri = (pkg: MediaPackage): string | undefined => {
  const withUri = pkg.subtitles.filter(
    (t) => typeof t.uri === 'string' && t.uri.length > 0,
  );
  return (withUri.find((t) => t.hasWordTimings) ?? withUri[0])?.uri;
};

export interface MarketScreenProps {
  /** Node-tested marketplace brain (browse/detail/consent-gated play). */
  readonly controls: MarketplaceControls;
  /** Current consent state; play is gated on `network`. */
  readonly consent: ConsentState;
  /** Grant `network` consent (App persists it) and return the new state. */
  readonly onGrantConsent: () => Promise<ConsentState>;
  /**
   * A package cleared to play — hand the resolved source to the player, plus the
   * best subtitle track's `uri` (word-level preferred) when the package declares
   * one, so the player can fetch and parse real subtitles. Optional/additive:
   * packages without a subtitle uri play exactly as before (empty document).
   */
  readonly onPlay: (media: MediaSource, subtitleUri?: string) => void;
  /** Optional "back to home" affordance; omitted when a tab bar handles nav. */
  readonly onBack?: () => void;
}

/** Marketplace: browse a list → open a detail → play (consent-gated). */
export function MarketScreen({
  controls,
  consent,
  onGrantConsent,
  onPlay,
  onBack,
}: MarketScreenProps): React.JSX.Element {
  const [items, setItems] = useState<readonly MediaPackageSummary[]>([]);
  const [selected, setSelected] = useState<MediaPackage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Id awaiting a consent grant before it can play (drives the ConsentSheet).
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void controls.browse().then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [controls]);

  const openDetail = async (id: string): Promise<void> => {
    const pkg = await controls.openPackage(id);
    if (pkg === null) {
      setNotice('该资源已下架');
      setItems(await controls.browse());
      return;
    }
    setNotice(null);
    setSelected(pkg);
  };

  // Resolve id → playback under `state`; play when ready, prompt when consent is
  // missing, or report if it vanished. Shared by the first tap and the retry
  // after a consent grant (with the freshly-returned state).
  const attemptPlay = async (id: string, state: ConsentState): Promise<void> => {
    const result = await controls.playPackage(id, state);
    if (!result.found) {
      setSelected(null);
      setNotice('该资源已下架');
      setItems(await controls.browse());
      return;
    }
    if (!result.ready) {
      setPendingId(id);
      return;
    }
    // `selected` is the detail package being played; pair its subtitle uri in.
    const subtitleUri =
      selected?.id === id ? pickSubtitleUri(selected) : undefined;
    onPlay(result.media, subtitleUri);
  };

  const grantThenPlay = async (): Promise<void> => {
    const id = pendingId;
    setPendingId(null);
    const next = await onGrantConsent();
    if (id !== null) {
      await attemptPlay(id, next);
    }
  };

  // Detail view.
  if (selected !== null) {
    const s = selected;
    const wordLevel = s.subtitles.some((t) => t.hasWordTimings);
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable style={styles.headerBtn} onPress={() => setSelected(null)}>
            <Text style={styles.headerBtnLabel}>‹ 返回</Text>
          </Pressable>
          <Text style={styles.title}>详情</Text>
          <View style={styles.headerBtn} />
        </View>

        <Text style={styles.detailTitle}>{s.meta.title}</Text>
        <Text style={styles.detailMeta}>
          {s.meta.sourceLang} → {s.meta.learningLang}
          {'   '}
          {formatClock(s.meta.durationMs ?? s.video.durationMs ?? 0)}
        </Text>
        <Text style={styles.detailMeta}>
          字幕 {s.subtitles.length} 条{wordLevel ? ' · 词级同步' : ''}
        </Text>
        <Text style={styles.detailUri} numberOfLines={2}>
          {s.video.uri}
        </Text>

        <Pressable style={styles.playBtn} onPress={() => void attemptPlay(s.id, consent)}>
          <Text style={styles.playBtnLabel}>▶ 播放</Text>
        </Pressable>

        {pendingId !== null && (
          <ConsentSheet
            onGrant={() => void grantThenPlay()}
            onDismiss={() => setPendingId(null)}
          />
        )}
      </View>
    );
  }

  // Browse view.
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
        <Text style={styles.title}>媒体市场</Text>
        <View style={styles.headerBtn} />
      </View>

      {notice !== null && <Text style={styles.notice}>{notice}</Text>}

      <FlatList
        style={styles.list}
        data={items}
        keyExtractor={(p) => p.id}
        ListEmptyComponent={<Text style={styles.empty}>市场暂无资源</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void openDetail(item.id)}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.sourceLang} → {item.learningLang} · {formatClock(item.durationMs ?? 0)}
                {item.hasWordTimings ? ' · 词级' : ''}
              </Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0f', padding: 20, paddingTop: 56, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBtn: { minWidth: 64, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10 },
  headerBtnLabel: { color: '#e6e6e6', fontSize: 15 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  notice: { color: '#ffb020', fontSize: 14 },
  list: { flex: 1, marginTop: 6 },
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
  rowMeta: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  rowChevron: { color: '#6b7280', fontSize: 22 },
  detailTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 8 },
  detailMeta: { color: '#9aa0aa', fontSize: 14 },
  detailUri: { color: '#6b7280', fontSize: 12, marginTop: 4 },
  playBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#4da3ff',
    alignItems: 'center',
  },
  playBtnLabel: { color: '#04101f', fontSize: 16, fontWeight: '700' },
});
