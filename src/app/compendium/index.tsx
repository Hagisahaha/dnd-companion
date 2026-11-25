import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CATEGORIES, Category, IndexEntry, search } from '../../compendium/store';
import { openEntry } from '../../components/compendium/Entries';
import { close } from '../../components/ui';
import { Palette, usePalette } from '../../theme/colors';

const ROW_H = 60;

export default function CompendiumSearch() {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<Category | null>(null);
  const q = useDeferredValue(query);
  const results = useMemo(() => search(q, cat), [q, cat]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.searchRow}>
        <View style={s.field}>
          <Text style={s.glass}>⌕</Text>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Spells, items, features, rules"
            placeholderTextColor={c.secondaryLabel}
            style={s.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable onPress={() => close()} hitSlop={8}>
          <Text style={s.cancel}>Done</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipBar} keyboardShouldPersistTaps="handled">
        {[{ key: null, label: 'All' }, ...CATEGORIES].map((x) => {
          const on = cat === x.key;
          return (
            <Pressable key={x.label} onPress={() => setCat(x.key as Category | null)} style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipText, on && s.chipTextOn]}>{x.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={results}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * i, index: i })}
        initialNumToRender={14}
        renderItem={({ item }) => <Row e={item} s={s} />}
        ListEmptyComponent={<Text style={s.empty}>No matches</Text>}
      />
    </SafeAreaView>
  );
}

function Row({ e, s }: { e: IndexEntry; s: ReturnType<typeof styles> }) {
  return (
    <Pressable onPress={() => openEntry(e.id)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{e.name}</Text>
        <Text style={s.sub} numberOfLines={1}>{e.subtitle}</Text>
      </View>
      <Text style={s.src}>{e.source}</Text>
    </Pressable>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
    field: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 10, paddingHorizontal: 8, height: 36 },
    glass: { fontSize: 18, color: c.secondaryLabel, marginRight: 4, marginTop: -2 },
    input: { flex: 1, fontSize: 17, color: c.label, paddingVertical: 0, outlineStyle: 'none' } as object,
    cancel: { fontSize: 17, color: c.accent },
    chipBar: { flexGrow: 0 },
    chips: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
    chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent },
    chipText: { fontSize: 14, color: c.label, fontWeight: '500' },
    chipTextOn: { color: c.onAccent },
    row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    rowPressed: { backgroundColor: c.fill },
    name: { fontSize: 17, color: c.label },
    sub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    src: { fontSize: 12, color: c.tertiaryLabel, marginLeft: 12, fontWeight: '500' },
    empty: { textAlign: 'center', color: c.secondaryLabel, marginTop: 40, fontSize: 15 },
  });
