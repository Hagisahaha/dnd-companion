import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { CastWith, castOptions, castSpell, spells } from '../../character/combat';
import { derive, fmtMod } from '../../character/engine';
import { useActiveCharacter, useCharacters } from '../../character/store';
import { ABILITY_NAME } from '../../character/types';
import { getEntry } from '../../compendium/store';
import { Entries } from '../../components/compendium/Entries';
import { useQuickRoll } from '../../components/QuickRoll';
import { Button, Row, Section, Segmented, useStyles } from '../../components/ui';
import { Palette } from '../../theme/colors';

/** Cast a spell: pick a slot, spend it, start concentration, then roll attack/damage at that level. */
export default function Cast() {
  const { id, cls } = useLocalSearchParams<{ id: string; cls: string }>();
  const c = useActiveCharacter();
  const update = useCharacters((s) => s.update);
  const quickRoll = useQuickRoll();
  const [st, pal] = useStyles(styles);
  const d = useMemo(() => (c ? derive(c) : null), [c]);
  const spell = useMemo(() => (c && d ? spells(c, d).find((x) => x.id === id && x.className === cls) : undefined), [c, d, id, cls]);
  const entry = useMemo(() => (id ? getEntry(id) : null), [id]);
  const [choice, setChoice] = useState<number>(0);
  const [cast, setCast] = useState<{ label: string; level: number } | null>(null);

  if (!c || !d || !spell || !entry) return null;
  const options = castOptions(spell, d);
  const opt = options[Math.min(choice, Math.max(0, options.length - 1))];
  const level = cast?.level ?? opt?.level ?? spell.level;
  const effects = spell.effects(Math.max(level, spell.level));
  const attackBonus = spell.attack ? spell.attack.value - 2 * c.exhaustion : 0;
  const pick = c.spells.find((x) => x.id === id && x.className === cls);
  const isWizard = cls === 'Wizard';

  const doCast = (how: CastWith, label: string, lvl: number) => {
    update(c.id, (x) => castSpell(x, spell, how));
    setCast({ label, level: lvl });
  };

  return (
    <ScrollView style={st.root} contentContainerStyle={st.content}>
      <Stack.Screen options={{ title: '', headerRight: () => <Pressable onPress={() => router.back()} hitSlop={8}><Text style={st.done}>Done</Text></Pressable> }} />
      <Text style={st.title}>{spell.name}</Text>
      <Text style={st.sub}>{entry.subtitle} · {spell.className}</Text>
      <Text style={st.meta}>{[spell.time, spell.range, spell.duration].join(' · ')}</Text>

      {!spell.prepared && <Text style={st.warn}>Not prepared. Prepare it before casting with a slot.</Text>}
      {c.concentration && spell.concentration && c.concentration !== spell.name && !cast && (
        <Text style={st.warn}>Casting this ends your concentration on {c.concentration}.</Text>
      )}

      {!cast ? (
        options.length ? (
          <View style={st.block}>
            {options.length > 1 && <Segmented options={options.map((o, i) => ({ value: String(i), label: o.label }))} value={String(Math.min(choice, options.length - 1))} onChange={(v) => setChoice(Number(v))} />}
            <Button style={{ marginTop: 10 }} title={spell.level === 0 ? 'Cast Cantrip' : `Cast · ${opt.label}${'slot' in opt.how || 'pact' in opt.how ? ' slot' : ''}`} onPress={() => doCast(opt.how, opt.label, opt.level)} disabled={!spell.prepared && spell.level > 0 && !('ritual' in opt.how)} />
          </View>
        ) : (
          <Text style={st.warn}>No spell slots of level {spell.level} or higher left.</Text>
        )
      ) : (
        <View style={st.castDone}>
          <Text style={st.castDoneText}>
            Cast{cast.level ? ` at level ${cast.level}` : ''}{cast.label === 'Ritual' ? ' as a ritual' : ''}{spell.concentration ? ' · concentrating' : ''}
          </Text>
        </View>
      )}

      {(spell.attack || spell.save || effects.length > 0) && (
        <View style={st.rolls}>
          {spell.attack && (
            <Button title={`Spell Attack ${fmtMod(attackBonus)}`} onPress={() => quickRoll(`1d20${attackBonus >= 0 ? '+' : ''}${attackBonus}`, { label: `${spell.name} attack`, mode: 'shared', then: effects[0] ? { label: `Roll ${effects[0].formula}`, formula: effects[0].formula } : undefined })} />
          )}
          {spell.save && <Text style={st.save}>Targets make a {ABILITY_NAME[spell.save.ability]} save against DC {spell.save.dc}</Text>}
          {effects.map((e) => (
            <Button key={e.label} kind="tinted" title={`${e.label}: ${e.formula}`} onPress={() => quickRoll(e.formula, { label: `${spell.name} · ${e.label}` })} />
          ))}
        </View>
      )}

      <Section style={{ marginHorizontal: 0, marginTop: 18 }}>
        {isWizard && spell.level > 0 && pick && (
          <Row first label="Prepared" right={<Switch value={pick.prepared} onValueChange={(prepared) => update(c.id, (x) => ({ ...x, spells: x.spells.map((y) => (y.id === id && y.className === cls ? { ...y, prepared } : y)) }))} />} />
        )}
        <Row first={!(isWizard && spell.level > 0)} label={isWizard ? 'Remove from spellbook' : 'Remove spell'} valueStyle={{ color: pal.red }} value=""
          onPress={() => {
            update(c.id, (x) => ({ ...x, spells: x.spells.filter((y) => !(y.id === id && y.className === cls)) }));
            router.back();
          }} />
      </Section>

      <View style={{ marginTop: 6 }}>
        <Entries entries={entry.entries} />
      </View>
    </ScrollView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { padding: 16, paddingBottom: 80 },
    done: { fontSize: 17, color: c.accent, fontWeight: '600', paddingHorizontal: 8 },
    title: { fontSize: 28, fontWeight: '700', color: c.label },
    sub: { fontSize: 15, color: c.secondaryLabel, marginTop: 2 },
    meta: { fontSize: 15, color: c.label, marginTop: 8 },
    warn: { fontSize: 14, color: c.red, marginTop: 10 },
    block: { marginTop: 14 },
    castDone: { marginTop: 14, backgroundColor: c.fill, borderRadius: 12, padding: 12 },
    castDoneText: { fontSize: 15, color: c.green, fontWeight: '600', textAlign: 'center' },
    rolls: { marginTop: 14, gap: 10 },
    save: { fontSize: 15, color: c.label, textAlign: 'center', paddingVertical: 4 },
  });
