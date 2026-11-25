import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { derive } from '../character/engine';
import { useActiveCharacter, useCharacters } from '../character/store';
import { Palette } from '../theme/colors';
import { useStyles } from './ui';

/** The always-visible strip above the dice tray: who you are, HP, AC, slots. One tap to the sheet or HP pad. */
export function CharacterBar() {
  const c = useActiveCharacter();
  const hydrated = useCharacters((s) => s.hydrated);
  const [st, pal] = useStyles(styles);
  const d = useMemo(() => (c ? derive(c) : null), [c]);

  if (!hydrated) return <View style={st.placeholder} />;
  if (!c || !d) {
    return (
      <Pressable onPress={() => router.push('/character/edit')} style={({ pressed }) => [st.bar, st.create, pressed && { opacity: 0.7 }]}>
        <Text style={st.createText}>Create a character</Text>
        <Text style={st.createSub}>Stats, HP and slots will live here</Text>
      </Pressable>
    );
  }

  const pct = Math.min(1, c.hp.current / Math.max(1, d.maxHp.value));
  const slots = d.slots.filter((s) => s.max > 0);
  return (
    <View style={st.bar}>
      <Pressable style={st.who} onPress={() => router.push('/character/sheet')} accessibilityLabel="Open character sheet">
        <Text style={st.name} numberOfLines={1}>{c.name}</Text>
        <Text style={st.cls} numberOfLines={1}>Level {d.level} · {d.summary}</Text>
        {slots.length > 0 || d.pact ? (
          <View style={st.slots}>
            {slots.slice(0, 5).map((s) => (
              <View key={s.level} style={st.slotGroup}>
                <Text style={st.slotLvl}>{s.level}</Text>
                {Array.from({ length: s.max }, (_, i) => (
                  <View key={i} style={[st.dot, i < s.max - s.used && st.dotOn]} />
                ))}
              </View>
            ))}
            {d.pact && (
              <View style={st.slotGroup}>
                <Text style={st.slotLvl}>P{d.pact.level}</Text>
                {Array.from({ length: d.pact.max }, (_, i) => (
                  <View key={i} style={[st.dot, i < d.pact!.max - d.pact!.used && st.dotOn]} />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </Pressable>
      <Pressable style={st.ac} onPress={() => router.push('/character/sheet')} accessibilityLabel={`Armor class ${d.ac.value}`}>
        <Text style={st.acValue}>{d.ac.value}</Text>
        <Text style={st.small}>AC</Text>
      </Pressable>
      <Pressable style={st.hp} onPress={() => router.push('/character/hp')} accessibilityLabel={`Hit points ${c.hp.current} of ${d.maxHp.value}`}>
        <Text style={st.hpValue}>
          {c.hp.current}
          <Text style={st.hpMax}>/{d.maxHp.value}</Text>
        </Text>
        <View style={st.track}>
          <View style={[st.fill, { width: `${pct * 100}%`, backgroundColor: pct <= 0.25 ? pal.red : pal.green }]} />
        </View>
        <Text style={st.small}>{c.hp.temp ? `HP · +${c.hp.temp} temp` : 'HP'}</Text>
      </Pressable>
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    placeholder: { height: 72, marginHorizontal: 8, marginBottom: 8 },
    bar: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginHorizontal: 8, marginBottom: 8, minHeight: 72 },
    create: { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', backgroundColor: c.surface, borderRadius: 16 },
    createText: { fontSize: 17, fontWeight: '600', color: c.accent },
    createSub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    who: { flex: 1, backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
    name: { fontSize: 17, fontWeight: '700', color: c.label },
    cls: { fontSize: 13, color: c.secondaryLabel, marginTop: 1 },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    slotGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    slotLvl: { fontSize: 11, color: c.tertiaryLabel, fontWeight: '600', marginRight: 1 },
    dot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: c.fillStrong },
    dotOn: { backgroundColor: c.accent, borderColor: c.accent },
    ac: { width: 64, backgroundColor: c.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    acValue: { fontSize: 24, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    hp: { width: 104, backgroundColor: c.surface, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, gap: 3 },
    hpValue: { fontSize: 24, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    hpMax: { fontSize: 15, fontWeight: '500', color: c.secondaryLabel },
    track: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: c.fill, overflow: 'hidden' },
    fill: { height: 4, borderRadius: 2 },
    small: { fontSize: 11, color: c.secondaryLabel, fontWeight: '500' },
  });
