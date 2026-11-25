import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { POINT_COST, STANDARD_ARRAY, derive, fmtMod, mod } from '../../character/engine';
import { RULES, getArmor, getBackground, getClass, getSpecies } from '../../character/rules';
import { blankCharacter, useCharacters } from '../../character/store';
import { ABILITIES, ABILITY_NAME, ABILITY_SHORT, Ability, Character, ProfLevel } from '../../character/types';
import { Button, Picker, PickerItem, Row, Section, Segmented, Stepper, useStyles } from '../../components/ui';
import { Palette } from '../../theme/colors';

type PickerKind = { kind: 'class'; index: number } | { kind: 'subclass'; index: number } | { kind: 'species' } | { kind: 'background' } | { kind: 'armor' };

const cap = (s: string) => s.replace(/\b\w/g, (m) => m.toUpperCase());

/** Ability priority for a class: its primary abilities, then CON, then DEX, then the rest. */
function priority(className: string): Ability[] {
  const primary = (getClass(className)?.primary ?? []) as Ability[];
  return [...new Set<Ability>([...primary, 'con', 'dex', 'wis', 'cha', 'int', 'str'])];
}

/** Standard array laid out the way most players would for this class (15 in the primary ability, and so on). */
function recommendedArray(className: string): Record<Ability, number> {
  const order = priority(className);
  return Object.fromEntries(order.map((a, i) => [a, STANDARD_ARRAY[i]])) as Record<Ability, number>;
}

/** +2 to the background ability the class cares most about, +1 to the next. */
function recommendedBonus(className: string, abilities: Ability[]): Partial<Record<Ability, number>> {
  if (abilities.length < 2) return {};
  const ranked = [...abilities].sort((a, b) => priority(className).indexOf(a) - priority(className).indexOf(b));
  return { [ranked[0]]: 2, [ranked[1]]: 1 };
}

export default function EditCharacter() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useCharacters((s) => (id ? s.characters[id] : undefined));
  const createChar = useCharacters((s) => s.create);
  const updateChar = useCharacters((s) => s.update);
  const removeChar = useCharacters((s) => s.remove);
  const [c, setC] = useState<Character>(() => existing ?? blankCharacter());
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [st, pal] = useStyles(styles);
  const d = useMemo(() => derive(c), [c]);
  const set = (patch: Partial<Character>) => setC((x) => ({ ...x, ...patch }));

  const bg = getBackground(c.backgroundId);
  const species = getSpecies(c.speciesId);
  const first = getClass(c.classes[0]?.name ?? '');

  const save = () => {
    const next = { ...c, name: c.name.trim() || 'Unnamed', updatedAt: Date.now() };
    if (existing) {
      // Keep HP sensible if max HP changed while editing.
      const max = derive(next).maxHp.value;
      updateChar(next.id, () => ({ ...next, hp: { ...next.hp, current: Math.min(next.hp.current, max) } }));
    } else {
      createChar({ ...next, hp: { current: derive(next).maxHp.value, temp: 0 } });
    }
    router.back();
  };

  // ---------- pickers ----------
  const pickerItems = (): { title: string; items: PickerItem[]; value: string | null; onPick: (v: string) => void } | null => {
    if (!picker) return null;
    switch (picker.kind) {
      case 'class':
        return {
          title: 'Class',
          items: RULES.classes.map((k) => ({ value: k.name, label: k.name, detail: `d${k.hitDie} · ${k.primary.map((a) => ABILITY_SHORT[a as Ability]).join(' or ')}${k.caster ? ' · Spellcaster' : ''}` })),
          value: c.classes[picker.index].name,
          onPick: (v) => {
            const classes = c.classes.map((x, i) => (i === picker.index ? { name: v, level: x.level, subclass: null } : x));
            // While creating, re-lay the standard array and background bonus for the new starting class.
            const relayout = !existing && picker.index === 0;
            const b = getBackground(c.backgroundId);
            set({
              classes,
              ...(relayout && c.scoreMethod === 'standard' ? { baseScores: recommendedArray(v) } : {}),
              ...(relayout && b ? { backgroundBonus: recommendedBonus(v, b.abilities) } : {}),
            });
          },
        };
      case 'subclass': {
        const k = getClass(c.classes[picker.index].name)!;
        return {
          title: `${k.name} Subclass`,
          items: k.subclasses.map((x) => ({ value: x.shortName, label: x.name, badge: x.source })).sort((a, b) => (a.badge === 'XPHB' ? -1 : 0) - (b.badge === 'XPHB' ? -1 : 0)),
          value: c.classes[picker.index].subclass,
          onPick: (v) => set({ classes: c.classes.map((x, i) => (i === picker.index ? { ...x, subclass: v } : x)) }),
        };
      }
      case 'species':
        return {
          title: 'Species',
          items: RULES.species.map((x) => ({ value: x.id, label: x.name, badge: x.source, detail: `Speed ${x.speed} ft.${x.darkvision ? ` · Darkvision ${x.darkvision} ft.` : ''}` })),
          value: c.speciesId,
          onPick: (v) => set({ speciesId: v }),
        };
      case 'background':
        return {
          title: 'Background',
          items: RULES.backgrounds.map((x) => ({ value: x.id, label: x.name, badge: x.source, detail: x.abilities.length ? x.abilities.map((a) => ABILITY_SHORT[a]).join(', ') : undefined })),
          value: c.backgroundId,
          onPick: (v) => {
            const b = getBackground(v)!;
            set({ backgroundId: v, backgroundBonus: recommendedBonus(c.classes[0].name, b.abilities) });
          },
        };
      case 'armor':
        return {
          title: 'Armor',
          items: [{ value: 'none', label: 'No armor' }, ...RULES.armor.filter((a) => a.kind !== 'shield').map((a) => ({ value: a.id, label: a.name, detail: `${cap(a.kind)} · AC ${a.ac}${a.kind === 'light' ? ' + Dex' : a.kind === 'medium' ? ' + Dex (max 2)' : ''}${a.strength ? ` · Str ${a.strength}` : ''}` }))],
          value: c.armorId ?? 'none',
          onPick: (v) => set({ armorId: v === 'none' ? null : v }),
        };
    }
  };
  const pk = pickerItems();

  // ---------- ability score helpers ----------
  const pointsSpent = ABILITIES.reduce((sum, a) => sum + (POINT_COST[c.baseScores[a]] ?? 0), 0);
  const setMethod = (m: Character['scoreMethod']) => {
    if (m === c.scoreMethod) return;
    const fresh: Record<Character['scoreMethod'], Record<Ability, number>> = {
      standard: recommendedArray(c.classes[0].name),
      pointbuy: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
      manual: c.baseScores,
    };
    set({ scoreMethod: m, baseScores: fresh[m] });
  };
  /** Standard array: moving a score up/down swaps it with the ability holding the neighbouring value. */
  const stepStandard = (a: Ability, dir: 1 | -1) => {
    const arr = [...STANDARD_ARRAY].sort((x, y) => x - y);
    const i = arr.indexOf(c.baseScores[a]);
    const target = arr[i + dir];
    if (target === undefined) return;
    const holder = ABILITIES.find((b) => c.baseScores[b] === target);
    set({ baseScores: { ...c.baseScores, [a]: target, ...(holder ? { [holder]: c.baseScores[a] } : {}) } });
  };

  const bonusMode = Object.values(c.backgroundBonus).some((v) => v === 2) ? 'two' : 'three';
  const setBonusMode = (m: 'two' | 'three') => {
    if (!bg) return;
    set({ backgroundBonus: m === 'three' ? Object.fromEntries(bg.abilities.map((a) => [a, 1])) : recommendedBonus(c.classes[0].name, bg.abilities) });
  };
  const plus2 = (Object.entries(c.backgroundBonus).find(([, v]) => v === 2)?.[0] ?? null) as Ability | null;
  const plus1 = (Object.entries(c.backgroundBonus).find(([, v]) => v === 1)?.[0] ?? null) as Ability | null;

  // ---------- skills ----------
  const choice = first?.skillChoice;
  const classOptions = new Set(choice && choice.from !== 'any' ? choice.from : []);
  const chosenFromClass = Object.entries(c.skills).filter(([k, v]) => v > 0 && classOptions.has(k) && !bg?.skills.includes(k)).length;
  const cycleSkill = (key: string, fromBg: boolean) => {
    const cur = (c.skills[key] ?? 0) as ProfLevel;
    const next: ProfLevel = fromBg ? (cur === 2 ? 1 : 2) : ((cur + 1) % 3) as ProfLevel;
    set({ skills: { ...c.skills, [key]: next } });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: existing ? 'Edit Character' : 'New Character',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={st.headerBtn}>Cancel</Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={save} hitSlop={8}>
              <Text style={[st.headerBtn, st.bold]}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView style={st.root} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Section>
          <View style={st.inputRow}>
            <TextInput value={c.name} onChangeText={(name) => set({ name })} placeholder="Character name" placeholderTextColor={pal.tertiaryLabel} style={st.input} />
          </View>
        </Section>

        <Section title="Class" footer={c.classes.length > 1 ? 'Saving throws and level-1 hit points come from the first class.' : undefined}>
          {c.classes.map((cl, i) => {
            const k = getClass(cl.name);
            const subAt = k?.subclassLevels[0] ?? 3;
            return (
              <View key={i}>
                <Row first={i === 0} label={cl.name} detail={i === 0 && c.classes.length > 1 ? 'Starting class' : undefined} onPress={() => setPicker({ kind: 'class', index: i })}
                  right={<Stepper value={cl.level} min={1} max={20} format={(v) => `Lv ${v}`} onChange={(v) => set({ classes: c.classes.map((x, j) => (j === i ? { ...x, level: v } : x)) })} />} />
                {cl.level >= subAt && (
                  <Row label="Subclass" value={k?.subclasses.find((s) => s.shortName === cl.subclass)?.name ?? 'Choose'} valueStyle={!cl.subclass ? { color: pal.accent } : undefined} onPress={() => setPicker({ kind: 'subclass', index: i })} />
                )}
                {i > 0 && <Row label="Remove this class" valueStyle={{ color: pal.red }} value="" onPress={() => set({ classes: c.classes.filter((_, j) => j !== i) })} />}
              </View>
            );
          })}
          <Row label="Add multiclass" onPress={() => set({ classes: [...c.classes, { name: RULES.classes.find((k) => !c.classes.some((x) => x.name === k.name))!.name, level: 1, subclass: null }] })} valueStyle={{ color: pal.accent }} />
        </Section>

        <Section title="Origin">
          <Row first label="Species" value={species?.name ?? 'Choose'} onPress={() => setPicker({ kind: 'species' })} />
          <Row label="Background" value={bg?.name ?? 'Choose'} onPress={() => setPicker({ kind: 'background' })} />
          {bg && bg.abilities.length === 3 && (
            <View style={[st.padRow, st.divider]}>
              <Segmented options={[{ value: 'two', label: '+2 / +1' }, { value: 'three', label: '+1 / +1 / +1' }]} value={bonusMode} onChange={setBonusMode} />
              {bonusMode === 'two' && (
                <View style={{ gap: 8, marginTop: 10 }}>
                  <View style={st.inline}>
                    <Text style={st.inlineLabel}>+2</Text>
                    <Segmented style={{ flex: 1 }} options={bg.abilities.map((a) => ({ value: a, label: ABILITY_SHORT[a] }))} value={plus2 ?? bg.abilities[0]}
                      onChange={(a) => set({ backgroundBonus: { [a]: 2, [plus1 && plus1 !== a ? plus1 : bg.abilities.find((x) => x !== a)!]: 1 } })} />
                  </View>
                  <View style={st.inline}>
                    <Text style={st.inlineLabel}>+1</Text>
                    <Segmented style={{ flex: 1 }} options={bg.abilities.filter((a) => a !== plus2).map((a) => ({ value: a, label: ABILITY_SHORT[a] }))} value={plus1 ?? ''}
                      onChange={(a) => set({ backgroundBonus: { [plus2!]: 2, [a]: 1 } })} />
                  </View>
                </View>
              )}
            </View>
          )}
        </Section>

        <Section
          title="Ability Scores"
          footer={c.scoreMethod === 'pointbuy' ? `${27 - pointsSpent} of 27 points left` : c.scoreMethod === 'standard' ? 'Use + and − to swap values between abilities.' : undefined}
        >
          <View style={st.padRow}>
            <Segmented options={[{ value: 'standard', label: 'Standard' }, { value: 'pointbuy', label: 'Point Buy' }, { value: 'manual', label: 'Manual' }]} value={c.scoreMethod} onChange={setMethod} />
          </View>
          {ABILITIES.map((a) => {
            const total = d.scores[a].value;
            const bonus = (c.backgroundBonus[a] ?? 0) + (c.otherBonus[a] ?? 0);
            return (
              <View key={a} style={[st.scoreRow, st.divider]}>
                <Text style={st.scoreName}>{ABILITY_NAME[a]}</Text>
                {c.scoreMethod === 'standard' ? (
                  <Stepper value={c.baseScores[a]} onChange={(v) => stepStandard(a, v > c.baseScores[a] ? 1 : -1)} min={8} max={15} />
                ) : c.scoreMethod === 'pointbuy' ? (
                  <Stepper value={c.baseScores[a]} min={8} max={15} onChange={(v) => {
                    const cost = pointsSpent - (POINT_COST[c.baseScores[a]] ?? 0) + (POINT_COST[v] ?? 0);
                    if (cost <= 27) set({ baseScores: { ...c.baseScores, [a]: v } });
                  }} />
                ) : (
                  <Stepper value={c.baseScores[a]} min={1} max={30} onChange={(v) => set({ baseScores: { ...c.baseScores, [a]: v } })} />
                )}
                <Text style={st.scoreBonus}>{bonus ? fmtMod(bonus) : ''}</Text>
                <Text style={st.scoreTotal}>{total}</Text>
                <Text style={st.scoreMod}>{fmtMod(mod(total))}</Text>
              </View>
            );
          })}
        </Section>

        <Section title="Skills" footer={choice ? `${first!.name}: choose ${choice.count}${choice.from === 'any' ? ' of any skills' : ''} (${chosenFromClass}/${choice.count} chosen). Tap to cycle proficient → expertise → none.` : undefined}>
          {d.skills.map((sk, i) => {
            const fromBg = sk.fromBackground;
            const option = classOptions.has(sk.key);
            return (
              <Row key={sk.key} first={i === 0} label={sk.name}
                detail={[ABILITY_SHORT[sk.ability], fromBg ? `${bg?.name} background` : option ? `${first?.name} option` : ''].filter(Boolean).join(' · ')}
                onPress={() => cycleSkill(sk.key, fromBg)}
                right={<Text style={[st.prof, sk.prof === 2 && st.profExp, sk.prof === 0 && st.profNone]}>{sk.prof === 2 ? 'Expertise' : sk.prof === 1 ? 'Proficient' : '—'}</Text>} />
            );
          })}
        </Section>

        <Section title="Equipment" footer={`AC ${d.ac.value}: ${d.ac.parts.map((p) => `${p.label} ${p.value}`).join(' + ')}`}>
          <Row first label="Armor" value={getArmor(c.armorId)?.name ?? 'None'} onPress={() => setPicker({ kind: 'armor' })} />
          <Row label="Shield" right={<Switch value={c.shield} onValueChange={(shield) => set({ shield })} />} />
          <Row label="Other AC bonus" detail="Magic items, Defense style" right={<Stepper value={c.acBonus} min={-5} max={10} format={fmtMod} onChange={(acBonus) => set({ acBonus })} />} />
        </Section>

        <Section title="Bonuses" footer="Ability Score Improvements, feats and magic items. These add on top of base and background.">
          {ABILITIES.map((a, i) => (
            <Row key={a} first={i === 0} label={ABILITY_NAME[a]} right={<Stepper value={c.otherBonus[a] ?? 0} min={-4} max={10} format={fmtMod} onChange={(v) => set({ otherBonus: { ...c.otherBonus, [a]: v } })} />} />
          ))}
          <Row label="HP per level" detail="Tough feat = +2" right={<Stepper value={c.hpPerLevelBonus} min={0} max={5} format={fmtMod} onChange={(hpPerLevelBonus) => set({ hpPerLevelBonus })} />} />
          <Row label="Saving throw proficiencies" detail={c.extraSaves.length ? c.extraSaves.map((a) => ABILITY_SHORT[a]).join(', ') : 'Resilient, etc.'} />
          <View style={[st.padRow, st.chips]}>
            {ABILITIES.map((a) => {
              const on = c.extraSaves.includes(a);
              const fromClass = first?.saves.includes(a);
              return (
                <Pressable key={a} disabled={fromClass} onPress={() => set({ extraSaves: on ? c.extraSaves.filter((x) => x !== a) : [...c.extraSaves, a] })} style={[st.chip, (on || fromClass) && st.chipOn, fromClass && { opacity: 0.5 }]}>
                  <Text style={[st.chipText, (on || fromClass) && st.chipTextOn]}>{ABILITY_SHORT[a]}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Result" footer={d.warnings.length ? d.warnings.join(' · ') : undefined}>
          <Row first label="Level" value={`${d.level} · ${d.summary}`} />
          <Row label="Hit Points" value={String(d.maxHp.value)} />
          <Row label="Armor Class" value={String(d.ac.value)} />
          <Row label="Proficiency Bonus" value={fmtMod(d.pb)} />
        </Section>

        <View style={{ marginHorizontal: 16, gap: 12 }}>
          <Button title={existing ? 'Save Changes' : 'Create Character'} onPress={save} />
          {existing && (
            <Button kind="destructive" title="Delete Character" onPress={() => {
              removeChar(existing.id);
              router.dismissAll();
            }} />
          )}
        </View>
      </ScrollView>
      {pk && <Picker visible title={pk.title} items={pk.items} value={pk.value} onPick={pk.onPick} onClose={() => setPicker(null)} />}
    </KeyboardAvoidingView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 16, paddingBottom: 60 },
    headerBtn: { fontSize: 17, color: c.accent, paddingHorizontal: 8 },
    bold: { fontWeight: '600' },
    inputRow: { paddingHorizontal: 16, height: 48, justifyContent: 'center' },
    input: { fontSize: 20, fontWeight: '600', color: c.label, outlineStyle: 'none' } as object,
    padRow: { paddingHorizontal: 12, paddingVertical: 10 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    inlineLabel: { width: 26, fontSize: 15, fontWeight: '600', color: c.label },
    scoreRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    scoreName: { flex: 1, fontSize: 16, color: c.label },
    scoreBonus: { width: 30, textAlign: 'right', fontSize: 14, color: c.green, fontVariant: ['tabular-nums'] },
    scoreTotal: { width: 30, textAlign: 'right', fontSize: 17, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'] },
    scoreMod: { width: 36, textAlign: 'right', fontSize: 15, color: c.secondaryLabel, fontVariant: ['tabular-nums'] },
    prof: { fontSize: 15, color: c.accent, fontWeight: '500' },
    profExp: { color: c.green },
    profNone: { color: c.tertiaryLabel },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent },
    chipText: { fontSize: 14, fontWeight: '600', color: c.label },
    chipTextOn: { color: c.onAccent },
  });
