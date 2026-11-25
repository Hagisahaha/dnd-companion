import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getEntry, sourceName } from '../../compendium/store';
import { Entries, Inline } from '../../components/compendium/Entries';
import { Palette, usePalette } from '../../theme/colors';

export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const e = useMemo(() => (id ? getEntry(id) : null), [id]);

  if (!e) {
    return (
      <View style={s.root}>
        <Text style={s.missing}>This entry isn't in the compendium.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={s.content}>
      <Text style={s.title}>{e.name}</Text>
      <Text style={s.subtitle}>{e.subtitle}</Text>
      {e.fields?.length ? (
        <View style={s.fields}>
          {e.fields.map(([k, v], i) => (
            <View key={k} style={[s.fieldRow, i > 0 && s.fieldDivider]}>
              <Text style={s.fieldKey}>{k}</Text>
              <Inline text={v} style={s.fieldVal} />
            </View>
          ))}
        </View>
      ) : null}
      <Entries entries={e.entries} />
      <Text style={s.source}>
        {sourceName(e.source)}
        {e.page ? `, p. ${e.page}` : ''}
      </Text>
    </ScrollView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 120 },
    title: { fontSize: 28, fontWeight: '700', color: c.label, letterSpacing: -0.4 },
    subtitle: { fontSize: 15, color: c.secondaryLabel, marginTop: 2, marginBottom: 14 },
    fields: { backgroundColor: c.surface, borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
    fieldRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
    fieldDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    fieldKey: { width: 112, fontSize: 15, color: c.secondaryLabel },
    fieldVal: { flex: 1, fontSize: 15, lineHeight: 20, marginBottom: 0 },
    source: { fontSize: 13, color: c.tertiaryLabel, marginTop: 16 },
    missing: { color: c.secondaryLabel, textAlign: 'center', marginTop: 60, fontSize: 15 },
  });
