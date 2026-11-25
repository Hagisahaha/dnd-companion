import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuickRoll } from '../components/QuickRoll';
import { useStyles, close } from '../components/ui';
import { HistoryEntry, useRollLog } from '../state/history';
import { Palette, usePalette } from '../theme/colors';

const time = (t: number) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const day = (t: number) => {
  const d = new Date(t);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** Every roll, newest first, so a result can be shown to the DM after the fact. Tap a row to roll it again. */
export default function History() {
  const history = useRollLog((s) => s.history);
  const clear = useRollLog((s) => s.clear);
  const quickRoll = useQuickRoll();
  const [st] = useStyles(styles);
  const c = usePalette();

  const rows = useMemo(() => {
    const out: ({ kind: 'day'; label: string; key: string } | { kind: 'roll'; e: HistoryEntry; key: string })[] = [];
    let last = '';
    for (const e of history) {
      const dl = day(e.at);
      if (dl !== last) out.push({ kind: 'day', label: dl, key: `d-${dl}` });
      last = dl;
      out.push({ kind: 'roll', e, key: e.id });
    }
    return out;
  }, [history]);

  return (
    <View style={st.root}>
      <Stack.Screen
        options={{
          title: 'Roll History',
          presentation: 'modal',
          headerShown: true,
          headerStyle: { backgroundColor: c.background },
          headerTitleStyle: { color: c.label },
          headerShadowVisible: false,
          headerLeft: () => history.length ? <Pressable onPress={clear} hitSlop={8}><Text style={st.clear}>Clear</Text></Pressable> : null,
          headerRight: () => <Pressable onPress={() => close()} hitSlop={8}><Text style={st.done}>Done</Text></Pressable>,
        }}
      />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        ListEmptyComponent={<Text style={st.empty}>No rolls yet.</Text>}
        renderItem={({ item }) =>
          item.kind === 'day' ? (
            <Text style={st.day}>{item.label}</Text>
          ) : (
            <Pressable onPress={() => quickRoll(item.e.formula.replace(/\s/g, ''), { label: item.e.label ?? undefined, mode: item.e.mode })} style={({ pressed }) => [st.row, pressed && st.pressed]} accessibilityHint="Rolls this again">
              <View style={{ flex: 1 }}>
                <Text style={st.title} numberOfLines={1}>
                  {item.e.label ?? item.e.formula}
                  {item.e.mode !== 'normal' ? <Text style={st.mode}>{item.e.mode === 'advantage' ? '  ADV' : '  DIS'}</Text> : null}
                </Text>
                <Text style={st.dice} numberOfLines={1}>
                  {item.e.dice.map((d) => `${d.sign < 0 ? '−' : ''}${d.dropped ? `(${d.value})` : d.value}${d.rerolls ? '↻' : ''}`).join(' + ')}
                  {item.e.modifier ? ` ${item.e.modifier > 0 ? '+' : '−'} ${Math.abs(item.e.modifier)}` : ''}
                  {item.e.label ? `  ·  ${item.e.formula}` : ''}
                </Text>
                <Text style={st.meta}>{[time(item.e.at), item.e.character].filter(Boolean).join(' · ')}</Text>
              </View>
              <Text style={[st.total, item.e.crit === 'success' && { color: c.green }, item.e.crit === 'fail' && { color: c.red }]}>{item.e.total}</Text>
            </Pressable>
          )
        }
      />
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    done: { fontSize: 17, color: c.accent, fontWeight: '600', paddingHorizontal: 8 },
    clear: { fontSize: 17, color: c.red, paddingHorizontal: 8 },
    empty: { color: c.secondaryLabel, textAlign: 'center', marginTop: 60, fontSize: 15 },
    day: { fontSize: 13, color: c.secondaryLabel, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator, gap: 12 },
    pressed: { backgroundColor: c.fill },
    title: { fontSize: 16, color: c.label, fontWeight: '500' },
    mode: { fontSize: 12, color: c.accent, fontWeight: '700' },
    dice: { fontSize: 14, color: c.secondaryLabel, marginTop: 2, fontVariant: ['tabular-nums'] },
    meta: { fontSize: 12, color: c.tertiaryLabel, marginTop: 2 },
    total: { fontSize: 28, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  });
