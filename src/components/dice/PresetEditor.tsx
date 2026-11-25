import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { formatFormula, parseFormula } from '../../dice/notation';
import { Preset, useRollLog } from '../../state/history';
import { Palette } from '../../theme/colors';
import { Button, useStyles } from '../ui';

/** Create or edit a saved formula such as "Fireball 8d6" or "Sneak Attack 3d6". */
export function PresetEditor({ preset, initialFormula, onClose }: { preset: Preset | null; initialFormula: string; onClose: () => void }) {
  const [st, pal] = useStyles(styles);
  const save = useRollLog((s) => s.savePreset);
  const remove = useRollLog((s) => s.removePreset);
  const [name, setName] = useState(preset?.name ?? '');
  const [formula, setFormula] = useState(preset?.formula ?? initialFormula);
  const parsed = parseFormula(formula);
  const negative = parsed?.terms.some((t) => t.sign < 0);
  const valid = !!parsed && parsed.terms.length > 0 && !negative;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.scrim} onPress={onClose}>
          <Pressable style={st.card} onPress={() => {}}>
            <Text style={st.title}>{preset ? 'Edit Preset' : 'New Preset'}</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name (e.g. Fireball)" placeholderTextColor={pal.tertiaryLabel} style={st.input} autoFocus={!preset} />
            <TextInput value={formula} onChangeText={setFormula} placeholder="Dice (e.g. 8d6 or 1d8+3)" placeholderTextColor={pal.tertiaryLabel} style={[st.input, st.mono]} autoCapitalize="none" autoCorrect={false} />
            <Text style={[st.check, !valid && formula ? { color: pal.red } : null]}>
              {!formula ? 'Dice like 2d8+1d6+4, d20, d%' : negative ? 'Presets hold dice in your hand, so subtracted dice aren’t supported' : parsed ? `Reads as ${formatFormula(parsed)}` : 'Not a dice formula'}
            </Text>
            <Button title="Save" disabled={!valid} onPress={() => { save({ id: preset?.id, name, formula: formatFormula(parsed!).replace(/\s/g, '') }); onClose(); }} />
            {preset && <Button kind="destructive" title="Delete" style={{ marginTop: 10 }} onPress={() => { remove(preset.id); onClose(); }} />}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    card: { backgroundColor: c.surface, borderRadius: 16, padding: 18 },
    title: { fontSize: 17, fontWeight: '700', color: c.label, marginBottom: 12 },
    input: { height: 44, borderRadius: 10, backgroundColor: c.fill, paddingHorizontal: 12, fontSize: 17, color: c.label, marginBottom: 10, outlineStyle: 'none' } as object,
    mono: { fontVariant: ['tabular-nums'] },
    check: { fontSize: 13, color: c.secondaryLabel, marginBottom: 14 },
  });
