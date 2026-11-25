import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { applyDamage, applyHealing, applyTempHp, derive, fmtMod } from '../../character/engine';
import { useActiveCharacter, useCharacters } from '../../character/store';
import { useQuickRoll } from '../../components/QuickRoll';
import { useStyles } from '../../components/ui';
import { Palette } from '../../theme/colors';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function HpPad() {
  const c = useActiveCharacter();
  const update = useCharacters((s) => s.update);
  const quickRoll = useQuickRoll();
  const [entry, setEntry] = useState('');
  const [note, setNote] = useState<{ text: string; roll?: { formula: string; label: string } } | null>(null);
  const [st, pal] = useStyles(styles);
  const d = useMemo(() => (c ? derive(c) : null), [c]);
  if (!c || !d) return null;

  const n = Number(entry) || 0;
  const apply = (kind: 'damage' | 'heal' | 'temp') => {
    if (!n) return;
    if (kind === 'damage') {
      const out = applyDamage(c, n);
      update(c.id, () => out.character);
      if (out.instantDeath) setNote({ text: 'Massive damage: the remaining damage equals or exceeds your max HP. You die.' });
      else if (out.concentrationDc) {
        const save = d.saves.con.value - 2 * c.exhaustion;
        setNote({ text: `Concentration on ${c.concentration}: Constitution save DC ${out.concentrationDc}`, roll: { formula: `1d20${save >= 0 ? '+' : ''}${save}`, label: `CON save DC ${out.concentrationDc}` } });
      } else if (out.character.hp.current === 0 && c.hp.current > 0) setNote({ text: 'You drop to 0 HP and fall Unconscious. Roll death saves at the start of your turns.' });
      else setNote(null);
    } else if (kind === 'heal') {
      update(c.id, (x) => applyHealing(x, n));
      setNote(null);
    } else {
      update(c.id, (x) => applyTempHp(x, n));
      setNote(c.hp.temp >= n ? { text: `Temporary HP don't stack: you keep ${c.hp.temp}.` } : null);
    }
    setEntry('');
  };

  const down = c.hp.current === 0;
  const pct = Math.min(1, c.hp.current / Math.max(1, d.maxHp.value));

  return (
    <SafeAreaView style={st.root} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Hit Points', headerRight: () => <Pressable onPress={() => router.back()} hitSlop={8}><Text style={st.done}>Done</Text></Pressable> }} />
      <View style={st.top}>
        <Text style={st.big}>
          {c.hp.current}
          <Text style={st.max}> / {d.maxHp.value}</Text>
        </Text>
        <View style={st.track}>
          <View style={[st.bar, { width: `${pct * 100}%`, backgroundColor: pct <= 0.25 ? pal.red : pal.green }]} />
        </View>
        <Text style={st.temp}>{c.hp.temp ? `${c.hp.temp} temporary HP` : 'No temporary HP'}</Text>

        {down && (
          <View style={st.death}>
            <DeathRow label="Successes" value={c.deathSaves.success} color={pal.green} onChange={(success) => update(c.id, (x) => ({ ...x, deathSaves: { ...x.deathSaves, success } }))} st={st} />
            <DeathRow label="Failures" value={c.deathSaves.fail} color={pal.red} onChange={(fail) => update(c.id, (x) => ({ ...x, deathSaves: { ...x.deathSaves, fail } }))} st={st} />
            <Pressable style={st.deathRoll} onPress={() => quickRoll('1d20', { label: 'Death save (10+ succeeds, 20 = regain 1 HP)', mode: 'shared' })}>
              <Text style={st.deathRollText}>Roll Death Save</Text>
            </Pressable>
          </View>
        )}

        {note && (
          <View style={st.note}>
            <Text style={st.noteText}>{note.text}</Text>
            {note.roll && (
              <Pressable onPress={() => quickRoll(note.roll!.formula, { label: note.roll!.label, mode: 'shared' })} style={st.noteBtn}>
                <Text style={st.noteBtnText}>Roll {fmtMod(Number(note.roll.formula.slice(4)) || 0)}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <Text style={st.entry}>{entry || ' '}</Text>
      <View style={st.pad}>
        {KEYS.map((k, i) => (
          <Pressable key={i} disabled={!k} onPress={() => setEntry((e) => (k === '⌫' ? e.slice(0, -1) : (e + k).replace(/^0+/, '').slice(0, 4)))} style={({ pressed }) => [st.key, !k && { opacity: 0 }, pressed && st.keyPressed]}>
            <Text style={st.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.actions}>
        <ActionBtn label="Damage" color={pal.red} disabled={!n} onPress={() => apply('damage')} st={st} />
        <ActionBtn label="Heal" color={pal.green} disabled={!n} onPress={() => apply('heal')} st={st} />
        <ActionBtn label="Temp" color={pal.accent} disabled={!n} onPress={() => apply('temp')} st={st} />
      </View>
    </SafeAreaView>
  );
}

function ActionBtn({ label, color, onPress, disabled, st }: { label: string; color: string; onPress: () => void; disabled: boolean; st: ReturnType<typeof styles> }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [st.action, { backgroundColor: color }, (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 }]}>
      <Text style={st.actionText}>{label}</Text>
    </Pressable>
  );
}

function DeathRow({ label, value, color, onChange, st }: { label: string; value: number; color: string; onChange: (v: number) => void; st: ReturnType<typeof styles> }) {
  return (
    <View style={st.deathRow}>
      <Text style={st.deathLabel}>{label}</Text>
      {[0, 1, 2].map((i) => (
        <Pressable key={i} hitSlop={6} onPress={() => onChange(value === i + 1 ? i : i + 1)} style={[st.deathPip, i < value && { backgroundColor: color, borderColor: color }]} />
      ))}
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    done: { fontSize: 17, color: c.accent, fontWeight: '600', paddingHorizontal: 8 },
    top: { flex: 1, paddingHorizontal: 24, paddingTop: 16, alignItems: 'center' },
    big: { fontSize: 64, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
    max: { fontSize: 30, fontWeight: '500', color: c.secondaryLabel },
    track: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: c.fill, overflow: 'hidden', marginTop: 8 },
    bar: { height: 8, borderRadius: 4 },
    temp: { fontSize: 15, color: c.accent, marginTop: 8 },
    death: { marginTop: 16, alignSelf: 'stretch', backgroundColor: c.surface, borderRadius: 12, padding: 12, gap: 10 },
    deathRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    deathLabel: { flex: 1, fontSize: 16, color: c.label },
    deathPip: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.fillStrong },
    deathRoll: { height: 40, borderRadius: 10, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' },
    deathRollText: { color: c.accent, fontSize: 16, fontWeight: '600' },
    note: { marginTop: 16, alignSelf: 'stretch', backgroundColor: c.fill, borderRadius: 12, padding: 12, gap: 10 },
    noteText: { fontSize: 15, color: c.label, lineHeight: 20 },
    noteBtn: { height: 40, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    noteBtnText: { color: c.onAccent, fontSize: 16, fontWeight: '600' },
    entry: { textAlign: 'center', fontSize: 40, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'], marginBottom: 6 },
    pad: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 24, gap: 10, justifyContent: 'center' },
    key: { width: '30%', height: 52, borderRadius: 12, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
    keyPressed: { backgroundColor: c.fillStrong },
    keyText: { fontSize: 24, color: c.label, fontWeight: '500' },
    actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8 },
    action: { flex: 1, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    actionText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  });
