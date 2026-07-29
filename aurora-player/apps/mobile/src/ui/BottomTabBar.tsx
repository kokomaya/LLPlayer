//
// ⚠️  ON-DEVICE REFERENCE BINDING — NOT TYPECHECKED / TESTED IN CI. ⚠️
//
// Bottom tab bar (首页 / 市场 / 设置). A DUMB presentational strip pinned to the
// bottom of the screen: it renders the three top-level destinations and forwards
// the picked one to `onSelect`. All navigation state lives in App.tsx's `view`.
// It IS linted (ESLint covers `**/*.tsx`); `react-native` is device-only.
//
import { Pressable, StyleSheet, Text, View } from 'react-native';

/** The three top-level destinations reachable from the tab bar. */
export type TabKey = 'home' | 'market' | 'settings';

const TABS: readonly { readonly key: TabKey; readonly icon: string; readonly label: string }[] = [
  { key: 'home', icon: '▶', label: '首页' },
  { key: 'market', icon: '🛒', label: '市场' },
  { key: 'settings', icon: '⚙', label: '设置' },
];

export interface BottomTabBarProps {
  /** Currently selected destination (drives the highlight). */
  readonly active: TabKey;
  /** Switch to a destination. */
  readonly onSelect: (key: TabKey) => void;
}

/** Persistent bottom navigation for the home/market/settings screens. */
export function BottomTabBar({ active, onSelect }: BottomTabBarProps): React.JSX.Element {
  return (
    <View style={styles.bar}>
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Pressable
            key={t.key}
            style={styles.tab}
            hitSlop={8}
            onPress={() => onSelect(t.key)}
          >
            <Text style={[styles.icon, on && styles.iconActive]}>{t.icon}</Text>
            <Text style={[styles.label, on && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: '#111116',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#26262e',
    paddingTop: 8,
    // Extra bottom padding clears the Android gesture/nav bar without a
    // safe-area dependency.
    paddingBottom: 20,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  icon: { fontSize: 18, color: '#6b7280' },
  iconActive: { color: '#4da3ff' },
  label: { fontSize: 11, color: '#6b7280' },
  labelActive: { color: '#4da3ff', fontWeight: '700' },
});
