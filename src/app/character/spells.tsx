import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { maxSpellLevel, spellListFor } from '../../character/combat';
import { derive } from '../../character/engine';
import { useActiveCharacter, useCharacters } from '../../character/store';
import { getEntry, getIndex, normalize } from '../../compendium/store';
import { openEntry } from '../../components/compendium/Entries';
import { useStyles } from '../../components/ui';
import { Palette } from '../../theme/colors';

interface Row {
  id: string;
  name: string;
  level: number;
  school: string;
  key: string;
}

/** Add/remove spells for one class. Shows only that class's list, up to the highest level it can cast. */
export default function ManageSpells() {
  const { cls } = useLocalSearchParams<{ cls: string }>();
  const c = useActiveCharacter();
  const update = useCharacters((s) => s.update);
  const [st, pal] = useStyles(styles);
  const [q, setQ] = useState('');
  const query = useDeferredValue(q);
  const [lvl, setLvl] = useState<number | null>(null);

  const cl = c?.classes.find((x) => x.name === cls);
  const d = useMemo(() => (c ? derive(c) : null), [c]);
  const list = cl ? spellListFor(cl.name, cl.subclass) : null;
  const max = cl ? maxSpellLevel(cl.name, cl.level, cl.subclass) : 0;

  const all = useMemo<Row[]>(() => {
    if (!list) return [];
    return getIndex()
      .filter((e) => e.cat === 'spell')
      .map((e) => {
        const data = getEntry(e.id)!.data as { level: number; school: string; classes: string[] };
        return { id: e.id, name: e.name, level: data.level, school: data.school, classes: data.classes, key: e.key };
      })
      .filter((r) => r.classes.includes(list) && r.level <= max)
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [list, max]);

  const shown = useMemo(() => {
    const n = normalize(query);
    return all.filter((r) => (lvl === null || r.level === lvl) && (!n || r.key.includes(n)));
  }, [all, query, lvl]);

  if (!c || !cl || !d || !list) return null;
  const sc = d.spellcasting.find((x) => x.className === cls);
  const mine = c.spells.filter((x) => x.className === cls);
  const cantrips = mine.filter((x) => (getEntry(x.id)?.data as { level: number } | undefined)?.level === 0).length;
  const prepared = mine.filter((x) => x.prepared && (getEntry(x.id)?.data as { level: number } | undefined)?.level !== 0).length;
  const isWizard = cls === 'Wizard';

  const toggle = (r: Row) => {
    const has = mine.some((x) => x.id === r.id);
    update(c.id, (x) => ({
      ...x,
      spells: has
        ? x.spells.filter((y) => !(y.id === r.id && y.className === cls))
        // Wizards copy into the spellbook; it's prepared only while there's room.
        : [...x.spells, { id: r.id, className: cls!, prepared: r.level === 0 || !isWizard || prepared < (sc?.prepared ?? 0) }],
    }));
  };

  return (
    <View style={st.root}>
      <Stack.Screen options={{ title: `${cls} Spells`, headerRight: () => <Pressable onPress={() => router.back()} hitSlop={8}><Text style={st.done}>Done</Text></Pressable> }} />
      <View style={st.summary}>
        <Text style={st.sumText}>
          Cantrips <Text style={cantrips > (sc?.cantrips ?? 0) ? st.over : st.ok}>{cantrips}/{sc?.cantrips ?? 0}</Text>
          {'   '}Prepared <Text style={prepared > (sc?.prepared ?? 0) ? st.over : st.ok}>{prepared}/{sc?.prepared ?? 0}</Text>
          {isWizard ? `   Spellbook ${mine.length - cantrips}` : ''}
        </Text>
        <Text style={st.sumSub}>{list === cls ? `${cls} spell list` : `${list} spell list`} · up to level {max}</Text>
      </View>
      <View style={st.field}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search spells" placeholderTextColor={pal.secondaryLabel} style={st.input} autoCorrect={false} />
      </View>
      <View style={{ height: 40 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
        {[null, ...Array.from({ length: max + 1 }, (_, i) => i)].map((l) => (
          <Pressable key={String(l)} onPress={() => setLvl(l)} style={[st.chip, lvl === l && st.chipOn]}>
            <Text style={[st.chipText, lvl === l && st.chipTextOn]}>{l === null ? 'All' : l === 0 ? 'Cantrips' : `Level ${l}`}</Text>
          </Pressable>
        ))}
      </ScrollView>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, i) => ({ length: 58, offset: 58 * i, index: i })}
        renderItem={({ item }) => {
          const has = mine.find((x) => x.id === item.id);
          return (
            <Pressable onPress={() => toggle(item)} onLongPress={() => openEntry(item.id)} style={({ pressed }) => [st.row, pressed && st.pressed]}>
              <View style={{ flex: 1 }}>
                <Text style={st.name}>{item.name}</Text>
                <Text style={st.sub}>{item.level === 0 ? `${item.school} cantrip` : `Level ${item.level} ${item.school}`}{has && !has.prepared && item.level > 0 ? ' · in spellbook' : ''}</Text>
              </View>
              <View style={[st.check, has && st.checkOn]}>{has ? <Text style={st.checkMark}>✓</Text> : null}</View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    done: { fontSize: 17, color: c.accent, fontWeight: '600', paddingHorizontal: 8 },
    summary: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6 },
    sumText: { fontSize: 15, color: c.label, fontWeight: '500' },
    sumSub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    ok: { color: c.accent, fontWeight: '700' },
    over: { color: c.red, fontWeight: '700' },
    field: { marginHorizontal: 16, marginVertical: 6, backgroundColor: c.fill, borderRadius: 10, height: 36, justifyContent: 'center', paddingHorizontal: 10 },
    input: { fontSize: 17, color: c.label, paddingVertical: 0, outlineStyle: 'none' } as object,
    chips: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent },
    chipText: { fontSize: 14, color: c.label, fontWeight: '500' },
    chipTextOn: { color: c.onAccent },
    row: { height: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    pressed: { backgroundColor: c.fill },
    name: { fontSize: 17, color: c.label },
    sub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.fillStrong, alignItems: 'center', justifyContent: 'center' },
    checkOn: { backgroundColor: c.accent, borderColor: c.accent },
    checkMark: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
  });
