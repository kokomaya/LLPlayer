//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// tsconfig `include` is `src/**/*.ts` (no .tsx) and vitest coverage excludes
// `src/ui/**`, so this leaf is type-validated on a device via Expo/Metro, not by
// `tsc`/Vitest here. It IS linted (ESLint covers `**/*.tsx`), so it stays
// syntactically clean. `react` / `react-native` are device-only deps.
//
// It is a DUMB view (plan/04): it paints a {@link SubtitleListViewState} and
// forwards word gestures to the Node-tested {@link SubtitleWordActions}. It holds
// NO timing / windowing / dictionary logic — the presenter decided which line is
// active and which window is visible; the controller owns seek + menu.
//
// ─────────────────────────────────────────────────────────────────────────────
// MOBILE vs PC (the shared-core answer to "如何在移动端和PC端区别适配")
// ─────────────────────────────────────────────────────────────────────────────
// The SAME `SubtitleListPresenter` + `SubtitleWordActions` back both platforms
// (they live in `scope:core`). Only the GESTURE→INTENT binding differs, and the
// controller API is deliberately gesture-neutral so each platform maps its own:
//
//   intent      | mobile (this file)          | desktop (Tauri/React DOM leaf)
//   ------------|-----------------------------|--------------------------------
//   seekToWord  | onPress (tap)               | onClick
//   openMenu    | onLongPress                 | onContextMenu (right-click) / hover
//   dismiss     | tap scrim                   | Esc / click-away
//
// A desktop binding imports the identical `runtime.subtitleList` view-state and
// `runtime.wordActions`; it renders <span onClick=…> instead of <Pressable> and
// pops a right-click menu instead of a long-press sheet. No core code forks.
//
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  SubtitleListViewState,
  SubtitleLineVM,
  SubtitleWordVM,
} from '@aurora/presentation';
import type {
  SubtitleWordActions,
  WordGloss,
} from '../composition/subtitle-word-actions.js';

export interface SubtitleListProps {
  /** Position-driven view-state from `runtime.subtitleList` (never derived here). */
  readonly state: SubtitleListViewState;
  /** Tap→seek / long-press→menu controller from `runtime.wordActions`. */
  readonly actions: SubtitleWordActions;
  /** Optional toast when a word is saved (收藏), so this file needs no toast dep. */
  readonly onFavorited?: (word: string) => void;
}

/** What the long-press menu is currently showing for the chosen word. */
interface MenuState {
  readonly word: SubtitleWordVM;
  readonly lineText: string;
}

/**
 * Word-addressable subtitle surface: a portrait transcript list (subx-style,
 * below the video) OR a fullscreen windowed view — the presenter's `mode` picks,
 * and `visibleRange` says which lines to paint. Every word is tappable
 * (→ seek) and long-pressable (→ 翻译/收藏/示例 menu).
 */
export function SubtitleList({
  state,
  actions,
  onFavorited,
}: SubtitleListProps): React.JSX.Element {
  const scrollRef = useRef<ScrollView | null>(null);
  const rowOffsets = useRef<Map<number, number>>(new Map());
  const [menu, setMenu] = useState<MenuState | null>(null);

  // Auto-scroll the active line into view (list mode only — fullscreen already
  // windows around it). Purely presentational; the active index came from the
  // presenter.
  useEffect(() => {
    if (state.mode !== 'list' || state.activeLineIndex === null) {
      return;
    }
    const y = rowOffsets.current.get(state.activeLineIndex);
    if (y !== undefined) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    }
  }, [state.activeLineIndex, state.mode]);

  const visible = state.lines.slice(state.visibleRange.start, state.visibleRange.end);

  return (
    <View style={state.mode === 'fullscreen' ? styles.fullscreen : styles.list}>
      <ScrollView
        ref={scrollRef}
        scrollEnabled={state.mode === 'list'}
        contentContainerStyle={styles.scrollBody}
      >
        {visible.map((line) => (
          <View
            key={line.id}
            onLayout={(e) =>
              rowOffsets.current.set(line.lineIndex, e.nativeEvent.layout.y)
            }
            style={[
              styles.lineRow,
              line.lineIndex === state.activeLineIndex && styles.lineRowActive,
            ]}
          >
            <LineWords
              line={line}
              activeWordIndex={
                line.lineIndex === state.activeLineIndex ? state.activeWordIndex : null
              }
              onTapWord={(word) => actions.seekToWord(word)}
              onHoldWord={(word) => setMenu({ word, lineText: line.text })}
            />
            {line.translated !== null && (
              <Text style={styles.translated}>{line.translated}</Text>
            )}
          </View>
        ))}
      </ScrollView>

      {menu !== null && (
        <WordMenuSheet
          menu={menu}
          actions={actions}
          onClose={() => setMenu(null)}
          onFavorited={onFavorited}
        />
      )}
    </View>
  );
}

/** One source line rendered as individually tappable words. */
function LineWords({
  line,
  activeWordIndex,
  onTapWord,
  onHoldWord,
}: {
  readonly line: SubtitleLineVM;
  readonly activeWordIndex: number | null;
  readonly onTapWord: (word: SubtitleWordVM) => void;
  readonly onHoldWord: (word: SubtitleWordVM) => void;
}): React.JSX.Element {
  // Fall back to a single non-tappable label when the line has no resolved words
  // (should not happen — the presenter always resolves at least interpolated
  // words — but keeps the view total).
  if (line.words.length === 0) {
    return <Text style={styles.word}>{line.text}</Text>;
  }
  return (
    <Text style={styles.lineText}>
      {line.words.map((word, i) => (
        <Text key={`${line.id}:${word.wordIndex}`}>
          {i > 0 ? ' ' : ''}
          <Text
            onPress={() => onTapWord(word)}
            onLongPress={() => onHoldWord(word)}
            style={[
              styles.word,
              word.estimated && styles.wordEstimated,
              word.wordIndex === activeWordIndex && styles.wordActive,
            ]}
          >
            {word.text}
          </Text>
        </Text>
      ))}
    </Text>
  );
}

/**
 * The long-press menu (mobile) — 翻译 / 收藏 / 示例. Async results from the
 * injected dictionary/vocabulary ports are resolved here and shown inline; the
 * desktop binding would render the same three intents as a right-click menu.
 */
function WordMenuSheet({
  menu,
  actions,
  onClose,
  onFavorited,
}: {
  readonly menu: MenuState;
  readonly actions: SubtitleWordActions;
  readonly onClose: () => void;
  readonly onFavorited?: (word: string) => void;
}): React.JSX.Element {
  const controller = useMemo(() => actions.openMenu(menu.word), [actions, menu.word]);
  const [gloss, setGloss] = useState<WordGloss | null>(null);
  const [examples, setExamples] = useState<readonly string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [externalMiss, setExternalMiss] = useState(false);

  const translate = async (): Promise<void> => {
    setGloss(await controller.translate());
  };
  const showExamples = async (): Promise<void> => {
    setExamples(await controller.examples());
  };
  // 翻译 via the device's installed translator/dictionary app (modern handoff —
  // no preset gloss table). Closes the sheet on a successful launch; if nothing
  // can handle the word we leave the sheet open with a hint.
  const openExternal = async (): Promise<void> => {
    if (await controller.openExternal(menu.lineText)) {
      onClose();
    } else {
      setExternalMiss(true);
    }
  };
  const favorite = async (): Promise<void> => {
    if (await controller.favorite({ lineText: menu.lineText })) {
      setSaved(true);
      onFavorited?.(menu.word.text);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        {/* Stop propagation so taps inside the card don't dismiss it. */}
        <Pressable
          style={styles.menuCard}
          onPress={() => {
            /* swallow — keeps the sheet open when tapping its body */
          }}
        >
          <Text style={styles.menuTitle}>{menu.word.text}</Text>
          <View style={styles.menuActions}>
            {actions.canLookupExternally && (
              <MenuButton label="翻译" onPress={openExternal} />
            )}
            {/* Inline dictionary gloss (only when an in-app dictionary port is
                wired). Labeled 词典 so it never collides with the external 翻译. */}
            {actions.canTranslate && (
              <MenuButton label="词典" onPress={translate} />
            )}
            {actions.canTranslate && (
              <MenuButton label="示例" onPress={showExamples} />
            )}
            {actions.canFavorite && (
              <MenuButton label={saved ? '已收藏' : '收藏'} onPress={favorite} />
            )}
          </View>

          {externalMiss && (
            <Text style={styles.externalMiss}>
              未找到可用的翻译/词典应用，请先安装一个（如 Google 翻译）。
            </Text>
          )}

          {gloss !== null && (
            <View style={styles.result}>
              {gloss.phonetics !== undefined && (
                <Text style={styles.phonetics}>/{gloss.phonetics}/</Text>
              )}
              {gloss.senses.map((sense, i) => (
                <Text key={i} style={styles.sense}>
                  {sense.partOfSpeech !== undefined ? `${sense.partOfSpeech}. ` : ''}
                  {sense.definition}
                </Text>
              ))}
            </View>
          )}

          {examples !== null && (
            <View style={styles.result}>
              {examples.length === 0 ? (
                <Text style={styles.sense}>（暂无示例）</Text>
              ) : (
                examples.map((ex, i) => (
                  <Text key={i} style={styles.example}>
                    · {ex}
                  </Text>
                ))
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void | Promise<void>;
}): React.JSX.Element {
  return (
    <Pressable style={styles.menuButton} onPress={() => void onPress()}>
      <Text style={styles.menuButtonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Portrait transcript below the video — the video keeps the top, this takes the
  // rest with a breathing margin (用户要求：视频在最上方，字幕列表在下方且有 margin).
  list: {
    flex: 1,
    marginTop: 12,
    backgroundColor: '#0d0d0f',
  },
  // Fullscreen: a compact strip overlaid at the bottom, showing only the
  // presenter's windowed lines.
  fullscreen: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    maxHeight: '40%',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  scrollBody: { paddingHorizontal: 16, paddingVertical: 8 },
  lineRow: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  lineRowActive: { backgroundColor: 'rgba(77,163,255,0.15)' },
  lineText: { color: '#e6e6e6', fontSize: 18, lineHeight: 28 },
  word: { color: '#e6e6e6', fontSize: 18 },
  wordEstimated: { fontStyle: 'italic', color: '#b9b9b9' },
  wordActive: { color: '#ffd54f', fontWeight: '700' },
  translated: { color: '#9aa0a6', fontSize: 14, marginTop: 4 },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 14,
    backgroundColor: '#1c1c1f',
    padding: 16,
  },
  menuTitle: { color: 'white', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  menuActions: { flexDirection: 'row', gap: 10 },
  menuButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  menuButtonLabel: { color: 'white', fontSize: 16 },
  result: {
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: 12,
  },
  externalMiss: { color: '#ffcc66', fontSize: 13, marginTop: 12 },
  phonetics: { color: '#9aa0a6', fontSize: 14, marginBottom: 6 },
  sense: { color: '#e6e6e6', fontSize: 16, marginBottom: 6 },
  example: { color: '#c9c9c9', fontSize: 15, marginBottom: 4 },
});
