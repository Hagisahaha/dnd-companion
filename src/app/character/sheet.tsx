import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { attacks as attacksOf, spellListFor, spells as spellsOf } from '../../character/combat';
import { derive, fmtMod, longRest, shortRest } from '../../character/engine';
import { RULES, getBackground, getSpecies } from '../../character/rules';
import { useActiveCharacter, useCharacters } from '../../character/store';
import { ABILITIES, ABILITY_NAME, ABILITY_SHORT, Stat } from '../../character/types';
import { getEntry, getIndex } from '../../compendium/store';
import { openEntry } from '../../components/compendium/Entries';
import { useQuickRoll } from '../../components/QuickRoll';
import { Button, Picker, Row, Section, Segmented, Stepper, useStyles } from '../../components/ui';
import { useRollMode } from '../../state/roll';
import { Palette } from '../../theme/colors';

type Tab = 'actions' | 'core' | 'spells' | 'features';

/** Feats whose numbers the app applies for you, and what it does. Keep in sync with engine.ts / combat.ts. */
const AUTOMATED: Record<string, string> = {
  Alert: '+Proficiency Bonus to Initiative',
  Tough: '+2 HP per level',
  Speedy: '+10 ft. Speed',
  Lucky: 'Luck Points tracked under Limited Uses',
  Defense: '+1 AC while wearing armor',
  Archery: '+2 to hit with ranged weapons',
  Dueling: '+2 damage with one-handed melee weapons',
  'Great Weapon Master': 'Extra damage button on Heavy weapon hits',
  'War Caster': 'Advantage on concentration saves from the HP screen',
};

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

export default function Sheet() {
  const c = useActiveCharacter();
  const update = useCharacters((s) => s.update);
  const quickRoll = useQuickRoll();
  const mode = useRollMode((s) => s.mode);
  const setMode = useRollMode((s) => s.set);
  const [tab, setTab] = useState<Tab>('actions');
  const [explain, setExplain] = useState<{ title: string; stat: Stat } | null>(null);
  const [addingWeapon, setAddingWeapon] = useState(false);
  const [editingWeapon, setEditingWeapon] = useState<string | null>(null);
  const [addingFeat, setAddingFeat] = useState(false);
  const featItems = useMemo(() => getIndex().filter((e) => e.cat === 'feat').map((e) => ({ value: e.id, label: e.name, detail: e.subtitle, badge: e.source })), []);
  const [st, pal] = useStyles(styles);
  const d = useMemo(() => (c ? derive(c) : null), [c]);
  const atk = useMemo(() => (c && d ? attacksOf(c, d) : []), [c, d]);
  const spl = useMemo(() => (c && d ? spellsOf(c, d) : []), [c, d]);

  if (!c || !d) {
    return (
      <View style={st.root}>
        <Stack.Screen options={{ title: 'Character' }} />
        <Text style={st.empty}>No character yet.</Text>
      </View>
    );
  }

  // 2024 Exhaustion: −2 per level to every d20 test.
  const check = (label: string, bonus: number) => {
    const b = bonus - 2 * c.exhaustion;
    quickRoll(`1d20${b >= 0 ? '+' : ''}${b}`, { label: c.exhaustion ? `${label} (exhaustion −${2 * c.exhaustion})` : label, mode: 'shared' });
  };
  const patch = (fn: Parameters<typeof update>[1]) => update(c.id, fn);
  const species = getSpecies(c.speciesId);
  const bg = getBackground(c.backgroundId);

  return (
    <View style={st.root}>
      <Stack.Screen
        options={{
          title: c.name,
          headerRight: () => (
            <Pressable onPress={() => router.push({ pathname: '/character/edit', params: { id: c.id } })} hitSlop={8}>
              <Text style={st.headerBtn}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={st.content} stickyHeaderIndices={[1]}>
        <View style={st.hero}>
          <Text style={st.sub}>
            Level {d.level} {d.summary.replace(/ \d+/g, (m) => (c.classes.length > 1 ? m : ''))}
            {c.classes[0]?.subclass ? ` (${c.classes[0].subclass})` : ''}
          </Text>
          <Text style={st.sub2}>{[species?.name, bg?.name].filter(Boolean).join(' · ')}</Text>
          <View style={st.stats}>
            <StatBox label="AC" value={String(d.ac.value)} onPress={() => setExplain({ title: 'Armor Class', stat: d.ac })} st={st} />
            <StatBox label="Initiative" value={fmtMod(d.initiative.value)} onPress={() => check('Initiative', d.initiative.value)} onLongPress={() => setExplain({ title: 'Initiative', stat: d.initiative })} st={st} accent />
            <StatBox label="Speed" value={`${d.speed.value}`} onPress={() => setExplain({ title: 'Speed', stat: d.speed })} st={st} />
            <StatBox label="Prof." value={fmtMod(d.pb)} st={st} />
          </View>
          <Pressable onPress={() => router.push('/character/hp')} style={({ pressed }) => [st.hpCard, pressed && { opacity: 0.7 }]} accessibilityLabel="Change hit points">
            <View style={{ flex: 1 }}>
              <Text style={st.hpLabel}>Hit Points</Text>
              <Text style={st.hpValue}>
                {c.hp.current}
                <Text style={st.hpMax}> / {d.maxHp.value}</Text>
                {c.hp.temp ? <Text style={st.hpTemp}>  +{c.hp.temp} temp</Text> : null}
              </Text>
            </View>
            <View style={st.hpBarTrack}>
              <View style={[st.hpBar, { width: `${Math.min(100, (c.hp.current / Math.max(1, d.maxHp.value)) * 100)}%`, backgroundColor: c.hp.current / d.maxHp.value <= 0.25 ? pal.red : pal.green }]} />
            </View>
          </Pressable>
          {c.concentration ? (
            <Pressable onPress={() => patch((x) => ({ ...x, concentration: null }))} style={st.banner}>
              <Text style={st.bannerText}>Concentrating on {c.concentration} · tap to end</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={st.sticky}>
          <Segmented options={[{ value: 'advantage', label: 'ADV' }, { value: 'normal', label: 'Normal' }, { value: 'disadvantage', label: 'DIS' }]} value={mode} onChange={setMode} />
          <Segmented style={{ marginTop: 8 }} options={[{ value: 'actions', label: 'Actions' }, { value: 'core', label: 'Core' }, { value: 'spells', label: 'Spells' }, { value: 'features', label: 'Features' }]} value={tab} onChange={setTab} />
        </View>

        {tab === 'actions' && (
          <>
            {c.classes.some((x) => x.name === 'Barbarian') && (() => {
              const rage = d.resources.find((r) => r.key === 'rage');
              const left = rage ? rage.max - rage.used : 0;
              return (
                <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                  {c.raging ? (
                    <Button kind="destructive" title="End Rage" onPress={() => patch((x) => ({ ...x, raging: false }))} />
                  ) : (
                    <Button title={`Enter Rage · ${left} left`} disabled={left <= 0} onPress={() => patch((x) => ({ ...x, raging: true, resourcesUsed: { ...x.resourcesUsed, rage: (x.resourcesUsed.rage ?? 0) + 1 } }))} />
                  )}
                  {c.raging && <Text style={st.rageNote}>Raging: resistance to Bludgeoning, Piercing and Slashing; Advantage on Strength checks and saves; Rage damage is included below.</Text>}
                </View>
              );
            })()}
            <Section title="Attacks" style={{ marginTop: 12 }} footer="Tap to roll the attack; the damage button follows on the result. Hold a weapon to edit it.">
              {atk.map((a, i) => (
                <View key={a.key}>
                  <Row first={i === 0} label={a.name}
                    detail={[a.range, `${a.damage} ${a.damageType}`, a.mastery ? `Mastery: ${a.mastery}` : '', ...a.notes].filter(Boolean).join(' · ')}
                    value={fmtMod(a.toHit.value)} valueStyle={a.proficient ? st.profValue : undefined}
                    onPress={() => quickRoll(`1d20${a.toHit.value - 2 * c.exhaustion >= 0 ? '+' : ''}${a.toHit.value - 2 * c.exhaustion}`, { label: `${a.name} attack`, mode: 'shared', then: [{ label: `Roll damage ${a.damage}`, formula: a.damage }, ...a.extras.map((x) => ({ label: `${x.label} (${x.formula})`, formula: x.formula }))] })}
                    onLongPress={() => (a.key === 'unarmed' ? setExplain({ title: a.name, stat: a.toHit }) : setEditingWeapon(a.key))}
                    right={<View />} />
                  {a.twoHanded && (
                    <Row label="  Two-handed" detail={`${a.twoHanded} ${a.damageType}`} value={fmtMod(a.toHit.value)} valueStyle={a.proficient ? st.profValue : undefined}
                      onPress={() => quickRoll(`1d20${a.toHit.value - 2 * c.exhaustion >= 0 ? '+' : ''}${a.toHit.value - 2 * c.exhaustion}`, { label: `${a.name} (two-handed)`, mode: 'shared', then: { label: `Roll damage ${a.twoHanded}`, formula: a.twoHanded! } })}
                      right={<View />} />
                  )}
                </View>
              ))}
              <Row label="Add weapon" valueStyle={{ color: pal.accent }} onPress={() => setAddingWeapon(true)} />
            </Section>

            {spl.some((x) => x.prepared && (x.attack || x.save || x.effects(x.level).length)) && (
              <Section title="Spell Attacks & Saves" footer="Tap to cast. Hold to read the spell.">
                {spl.filter((x) => x.prepared && (x.attack || x.save || x.effects(x.level).length)).map((x, i) => (
                  <Row key={x.id + x.className} first={i === 0} label={x.name}
                    detail={[x.level ? `Level ${x.level}` : 'Cantrip', x.time, x.effects(x.level)[0]?.formula].filter(Boolean).join(' · ')}
                    value={x.attack ? fmtMod(x.attack.value) : x.save ? `DC ${x.save.dc}` : ''}
                    valueStyle={st.profValue}
                    onPress={() => router.push({ pathname: '/character/cast', params: { id: x.id, cls: x.className } })}
                    onLongPress={() => openEntry(x.id)} right={<View />} />
                ))}
              </Section>
            )}
          </>
        )}

        {tab === 'core' && (
          <>
            <View style={st.abilities}>
              {ABILITIES.map((a) => (
                <Pressable key={a} onPress={() => check(`${ABILITY_NAME[a]} check`, d.mods[a])} onLongPress={() => setExplain({ title: ABILITY_NAME[a], stat: d.scores[a] })} style={({ pressed }) => [st.ability, pressed && { opacity: 0.6 }]} accessibilityLabel={`${ABILITY_NAME[a]} check`}>
                  <Text style={st.abilityName}>{ABILITY_SHORT[a]}</Text>
                  <Text style={st.abilityMod}>{fmtMod(d.mods[a])}</Text>
                  <Text style={st.abilityScore}>{d.scores[a].value}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={st.hint}>Tap to roll · hold to see how it&apos;s calculated</Text>

            <Section title="Saving Throws">
              {ABILITIES.map((a, i) => (
                <Row key={a} first={i === 0} label={ABILITY_NAME[a]} value={fmtMod(d.saves[a].value)} valueStyle={d.saves[a].proficient ? st.profValue : undefined}
                  detail={d.saves[a].proficient ? 'Proficient' : undefined}
                  onPress={() => check(`${ABILITY_NAME[a]} save`, d.saves[a].value)} onLongPress={() => setExplain({ title: `${ABILITY_NAME[a]} Save`, stat: d.saves[a] })} right={<View />} />
              ))}
            </Section>

            <Section title="Skills" footer={`Passive Perception ${d.passivePerception.value}`}>
              {d.skills.map((sk, i) => (
                <Row key={sk.key} first={i === 0} label={sk.name} detail={`${ABILITY_SHORT[sk.ability]}${sk.prof === 2 ? ' · Expertise' : sk.prof === 1 ? ' · Proficient' : ''}`}
                  value={fmtMod(sk.stat.value)} valueStyle={sk.prof ? st.profValue : undefined}
                  onPress={() => check(sk.name, sk.stat.value)} onLongPress={() => setExplain({ title: sk.name, stat: sk.stat })} right={<View />} />
              ))}
            </Section>

            {d.resources.length > 0 && (
              <Section title="Limited Uses" footer="Tap a pip to spend or restore a use.">
                {d.resources.map((r, i) => (
                  <View key={r.key} style={[st.resRow, i > 0 && st.divider]}>
                    <Pressable style={{ flex: 1 }} onPress={() => r.featureId && openEntry(r.featureId)}>
                      <Text style={st.resName}>{r.name}</Text>
                      <Text style={st.resSub}>{r.max - r.used} of {r.max} left · {r.shortRest === 'none' ? 'Long rest' : r.shortRest === 'all' ? 'Short or long rest' : `Short rest +${r.shortRest}`}</Text>
                    </Pressable>
                    {r.max <= 10 ? (
                      <Pips max={r.max} used={r.used} onChange={(used) => patch((x) => ({ ...x, resourcesUsed: { ...x.resourcesUsed, [r.key]: used } }))} st={st} />
                    ) : (
                      <View style={st.counter}>
                        <Pressable onPress={() => patch((x) => ({ ...x, resourcesUsed: { ...x.resourcesUsed, [r.key]: Math.min(r.max, r.used + 1) } }))} style={st.counterBtn}><Text style={st.counterGlyph}>−</Text></Pressable>
                        <Text style={st.counterVal}>{r.max - r.used}</Text>
                        <Pressable onPress={() => patch((x) => ({ ...x, resourcesUsed: { ...x.resourcesUsed, [r.key]: Math.max(0, r.used - 1) } }))} style={st.counterBtn}><Text style={st.counterGlyph}>+</Text></Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </Section>
            )}

            <Section title="Conditions" footer={c.exhaustion ? `Exhaustion ${c.exhaustion}: −${c.exhaustion * 2} to d20 tests, −${c.exhaustion * 5} ft. speed` : undefined}>
              <View style={[st.chips, { padding: 12 }]}>
                {CONDITIONS.map((name) => {
                  const on = c.conditions.includes(name);
                  return (
                    <Pressable key={name} onPress={() => patch((x) => ({ ...x, conditions: on ? x.conditions.filter((y) => y !== name) : [...x.conditions, name] }))} onLongPress={() => openEntry(`condition:${name.toLowerCase()}|xphb`)} style={[st.chip, on && st.chipOn]}>
                      <Text style={[st.chipText, on && st.chipTextOn]}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Row label="Exhaustion" right={<Pips max={6} used={c.exhaustion} onChange={(exhaustion) => patch((x) => ({ ...x, exhaustion }))} st={st} danger />} />
            </Section>

            <View style={st.rest}>
              <Button kind="tinted" title="Short Rest" style={{ flex: 1 }} onPress={() => patch(shortRest)} />
              <Button kind="tinted" title="Long Rest" style={{ flex: 1 }} onPress={() => patch(longRest)} />
            </View>
          </>
        )}

        {tab === 'spells' && (
          <>
            {d.spellcasting.length === 0 && !d.pact && <Text style={st.empty}>No spellcasting.</Text>}
            {d.spellcasting.map((sc, i) => (
              <Section key={sc.className} title={`${sc.className} Spellcasting`} style={i === 0 ? { marginTop: 12 } : undefined}>
                <Row first label="Spell Save DC" value={String(sc.dc.value)} onLongPress={() => setExplain({ title: 'Spell Save DC', stat: sc.dc })} onPress={() => setExplain({ title: 'Spell Save DC', stat: sc.dc })} right={<View />} />
                <Row label="Spell Attack" value={fmtMod(sc.attack.value)} valueStyle={st.profValue} onPress={() => check('Spell attack', sc.attack.value)} onLongPress={() => setExplain({ title: 'Spell Attack', stat: sc.attack })} right={<View />} />
              </Section>
            ))}
            {d.slots.length > 0 && (
              <Section title="Spell Slots" footer="Tap a pip to spend or restore a slot. Long rest restores all.">
                {d.slots.map((sl, i) => (
                  <View key={sl.level} style={[st.resRow, i > 0 && st.divider]}>
                    <Text style={[st.resName, { flex: 1 }]}>Level {sl.level}</Text>
                    <Pips max={sl.max} used={sl.used} onChange={(used) => patch((x) => { const s = [...x.slotsUsed]; s[sl.level - 1] = used; return { ...x, slotsUsed: s }; })} st={st} />
                  </View>
                ))}
              </Section>
            )}
            {d.pact && (
              <Section title="Pact Magic" footer="Pact slots come back on a short or long rest.">
                <View style={st.resRow}>
                  <Text style={[st.resName, { flex: 1 }]}>Level {d.pact.level} slots</Text>
                  <Pips max={d.pact.max} used={d.pact.used} onChange={(pactUsed) => patch((x) => ({ ...x, pactUsed }))} st={st} />
                </View>
              </Section>
            )}
            {c.classes.map((cl) => {
              const list = spellListFor(cl.name, cl.subclass);
              const sc = d.spellcasting.find((x) => x.className === cl.name);
              if (!list || !sc) return null;
              const mine = spl.filter((x) => x.className === cl.name);
              const cantrips = mine.filter((x) => x.level === 0).length;
              const prepared = mine.filter((x) => x.level > 0 && x.prepared && !x.always).length;
              const levels = [...new Set(mine.map((x) => x.level))];
              return (
                <View key={cl.name}>
                  <Text style={st.counts}>
                    {cl.name} · Cantrips <Text style={cantrips > sc.cantrips ? st.over : undefined}>{cantrips}/{sc.cantrips}</Text> · Prepared{' '}
                    <Text style={prepared > sc.prepared ? st.over : undefined}>{prepared}/{sc.prepared}</Text>
                  </Text>
                  {levels.map((lvl) => (
                    <Section key={lvl} title={lvl === 0 ? 'Cantrips' : `Level ${lvl}`}>
                      {mine.filter((x) => x.level === lvl).map((x, i) => (
                        <Row key={x.id + (x.always ? '-a' : '')} first={i === 0} label={x.name}
                          detail={[x.always ? 'Always prepared' : '', x.time, x.range, x.concentration ? 'Concentration' : '', x.ritual ? 'Ritual' : '', !x.prepared ? 'Not prepared' : ''].filter(Boolean).join(' · ')}
                          value={x.attack ? fmtMod(x.attack.value) : x.save ? `DC ${x.save.dc}` : x.effects(x.level)[0]?.formula ?? ''}
                          valueStyle={x.prepared ? st.profValue : st.dim}
                          onPress={() => router.push({ pathname: '/character/cast', params: { id: x.id, cls: x.className } })}
                          onLongPress={() => openEntry(x.id)} right={<View />} />
                      ))}
                    </Section>
                  ))}
                  <View style={{ marginHorizontal: 16, marginBottom: 22 }}>
                    <Button kind="tinted" title={mine.length ? `Manage ${cl.name} Spells` : `Add ${cl.name} Spells`} onPress={() => router.push({ pathname: '/character/spells', params: { cls: cl.name } })} />
                  </View>
                </View>
              );
            })}
          </>
        )}

        {tab === 'features' && (
          <>
          <Section title="Feats" style={{ marginTop: 12 }} footer="Hold a feat to remove it. Ability increases from feats go in Edit → Bonuses.">
            {c.feats.map((id, i) => {
              const e = getEntry(id);
              const auto = AUTOMATED[e?.name ?? ''];
              return (
                <Row key={id} first={i === 0} label={e?.name ?? id} detail={auto ? `Applied: ${auto}` : e?.subtitle}
                  onPress={() => openEntry(id)} onLongPress={() => patch((x) => ({ ...x, feats: x.feats.filter((f) => f !== id) }))} />
              );
            })}
            <Row first={c.feats.length === 0} label="Add feat" valueStyle={{ color: pal.accent }} onPress={() => setAddingFeat(true)} />
          </Section>
          <Section title="Features">
            {d.features.map((f, i) => (
              <Row key={`${f.source}-${f.name}-${f.level}`} first={i === 0} label={f.name} detail={`${f.source} · Level ${f.level}`} onPress={f.id ? () => openEntry(f.id!) : undefined} />
            ))}
          </Section>
          </>
        )}
      </ScrollView>

      <Picker
        visible={addingFeat}
        title="Add Feat"
        items={featItems}
        value={null}
        onPick={(id) => patch((x) => (x.feats.includes(id) ? x : { ...x, feats: [...x.feats, id] }))}
        onClose={() => setAddingFeat(false)}
      />

      <Picker
        visible={addingWeapon}
        title="Add Weapon"
        items={RULES.weapons.map((w) => ({ value: w.id, label: w.name, detail: `${w.category === 'simple' ? 'Simple' : 'Martial'} ${w.ranged ? 'ranged' : 'melee'} · ${w.damage}${w.versatile ? ` (${w.versatile})` : ''} ${w.damageType}${w.properties.length ? ` · ${w.properties.join(', ')}` : ''}` }))}
        value={null}
        onPick={(itemId) => patch((x) => ({ ...x, weapons: [...x.weapons, { key: `${Date.now()}`, itemId, bonus: 0 }] }))}
        onClose={() => setAddingWeapon(false)}
      />

      <Modal visible={!!editingWeapon} transparent animationType="fade" onRequestClose={() => setEditingWeapon(null)}>
        <Pressable style={st.scrim} onPress={() => setEditingWeapon(null)}>
          {editingWeapon && (() => {
            const w = c.weapons.find((x) => x.key === editingWeapon);
            const a = atk.find((x) => x.key === editingWeapon);
            if (!w || !a) return null;
            return (
              <Pressable style={st.explain} onPress={() => {}}>
                <Text style={st.explainTitle}>{a.name}</Text>
                {a.toHit.parts.map((p, i) => (
                  <View key={i} style={st.explainRow}>
                    <Text style={st.explainLabel}>{p.label}</Text>
                    <Text style={st.explainVal}>{fmtMod(p.value)}</Text>
                  </View>
                ))}
                <View style={[st.explainRow, st.divider, { paddingTop: 10, alignItems: 'center' }]}>
                  <Text style={st.explainLabel}>Magic bonus</Text>
                  <Stepper value={w.bonus} min={0} max={3} format={(v) => `+${v}`} onChange={(bonus) => patch((x) => ({ ...x, weapons: x.weapons.map((y) => (y.key === w.key ? { ...y, bonus } : y)) }))} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <Button kind="tinted" title="Details" style={{ flex: 1 }} onPress={() => { setEditingWeapon(null); openEntry(w.itemId); }} />
                  <Button kind="destructive" title="Remove" style={{ flex: 1 }} onPress={() => { patch((x) => ({ ...x, weapons: x.weapons.filter((y) => y.key !== w.key) })); setEditingWeapon(null); }} />
                </View>
              </Pressable>
            );
          })()}
        </Pressable>
      </Modal>

      <Modal visible={!!explain} transparent animationType="fade" onRequestClose={() => setExplain(null)}>
        <Pressable style={st.scrim} onPress={() => setExplain(null)}>
          {explain && (
            <View style={st.explain}>
              <Text style={st.explainTitle}>{explain.title}</Text>
              {explain.stat.parts.map((p, i) => (
                <View key={i} style={st.explainRow}>
                  <Text style={st.explainLabel}>{p.label}</Text>
                  <Text style={st.explainVal}>{/modifier|Proficiency|Expertise|Jack|Override|bonus/i.test(p.label) ? fmtMod(p.value) : p.value}</Text>
                </View>
              ))}
              <View style={[st.explainRow, st.divider, { paddingTop: 10 }]}>
                <Text style={[st.explainLabel, { fontWeight: '700', color: pal.label }]}>Total</Text>
                <Text style={[st.explainVal, { fontWeight: '700' }]}>{explain.stat.value}</Text>
              </View>
            </View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

function StatBox({ label, value, onPress, onLongPress, st, accent }: { label: string; value: string; onPress?: () => void; onLongPress?: () => void; st: ReturnType<typeof styles>; accent?: boolean }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress} style={({ pressed }) => [st.statBox, pressed && { opacity: 0.6 }]} accessibilityLabel={`${label} ${value}`}>
      <Text style={[st.statValue, accent && st.profValue]}>{value}</Text>
      <Text style={st.statLabel}>{label}</Text>
    </Pressable>
  );
}

/** Row of pips: filled = available. Tapping pip i makes exactly i+1 available (tap the last filled one to spend it). */
function Pips({ max, used, onChange, st, danger }: { max: number; used: number; onChange: (used: number) => void; st: ReturnType<typeof styles>; danger?: boolean }) {
  const available = danger ? used : max - used;
  return (
    <View style={st.pips}>
      {Array.from({ length: max }, (_, i) => {
        const filled = i < available;
        return (
          <Pressable key={i} hitSlop={4} onPress={() => {
            const nextAvail = filled && i === available - 1 ? i : i + 1;
            onChange(danger ? nextAvail : max - nextAvail);
          }} style={[st.pip, filled && (danger ? st.pipDanger : st.pipOn)]} accessibilityLabel={`${i + 1} of ${max}`} />
        );
      })}
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingBottom: 80 },
    headerBtn: { fontSize: 17, color: c.accent, paddingHorizontal: 8 },
    empty: { color: c.secondaryLabel, textAlign: 'center', marginTop: 40, fontSize: 15 },
    hero: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
    sub: { fontSize: 17, color: c.label, fontWeight: '600' },
    sub2: { fontSize: 15, color: c.secondaryLabel, marginTop: 2 },
    stats: { flexDirection: 'row', gap: 8, marginTop: 14 },
    statBox: { flex: 1, backgroundColor: c.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    statLabel: { fontSize: 12, color: c.secondaryLabel, marginTop: 2 },
    hpCard: { marginTop: 8, backgroundColor: c.surface, borderRadius: 12, padding: 14, gap: 10 },
    hpLabel: { fontSize: 13, color: c.secondaryLabel },
    hpValue: { fontSize: 28, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    hpMax: { fontSize: 20, fontWeight: '500', color: c.secondaryLabel },
    hpTemp: { fontSize: 15, fontWeight: '600', color: c.accent },
    hpBarTrack: { height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden' },
    hpBar: { height: 6, borderRadius: 3 },
    banner: { marginTop: 8, backgroundColor: c.fill, borderRadius: 10, padding: 10 },
    bannerText: { color: c.label, fontSize: 14, textAlign: 'center' },
    sticky: { backgroundColor: c.background, paddingHorizontal: 16, paddingVertical: 8 },
    abilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 8 },
    ability: { width: '31.5%', flexGrow: 1, backgroundColor: c.surface, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    abilityName: { fontSize: 12, fontWeight: '600', color: c.secondaryLabel, letterSpacing: 0.5 },
    abilityMod: { fontSize: 26, fontWeight: '700', color: c.accent, fontVariant: ['tabular-nums'] },
    abilityScore: { fontSize: 13, color: c.secondaryLabel, fontVariant: ['tabular-nums'] },
    hint: { fontSize: 12, color: c.tertiaryLabel, textAlign: 'center', marginTop: 6, marginBottom: 16 },
    profValue: { color: c.accent, fontWeight: '600' },
    dim: { color: c.tertiaryLabel },
    counts: { fontSize: 13, color: c.secondaryLabel, marginHorizontal: 32, marginBottom: 8, marginTop: 4 },
    over: { color: c.red, fontWeight: '700' },
    rageNote: { fontSize: 13, color: c.red, marginTop: 8, textAlign: 'center', lineHeight: 18 },
    resRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 12 },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    resName: { fontSize: 17, color: c.label },
    resSub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    pips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, maxWidth: 180, justifyContent: 'flex-end' },
    pip: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: c.fillStrong },
    pipOn: { backgroundColor: c.accent, borderColor: c.accent },
    pipDanger: { backgroundColor: c.red, borderColor: c.red },
    counter: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 9 },
    counterBtn: { width: 38, height: 32, alignItems: 'center', justifyContent: 'center' },
    counterGlyph: { fontSize: 20, color: c.label },
    counterVal: { minWidth: 36, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'] },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
    chipOn: { backgroundColor: c.red },
    chipText: { fontSize: 14, color: c.label, fontWeight: '500' },
    chipTextOn: { color: '#fff' },
    rest: { flexDirection: 'row', gap: 12, marginHorizontal: 16 },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 32 },
    explain: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    explainTitle: { fontSize: 17, fontWeight: '700', color: c.label, marginBottom: 10 },
    explainRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    explainLabel: { fontSize: 15, color: c.secondaryLabel },
    explainVal: { fontSize: 15, color: c.label, fontVariant: ['tabular-nums'] },
  });
