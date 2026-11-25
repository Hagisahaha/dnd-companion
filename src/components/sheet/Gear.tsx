import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { Derived } from '../../character/engine';
import { getArmor, getWeapon } from '../../character/rules';
import type { Character, InventoryItem } from '../../character/types';
import { getEntry, getIndex } from '../../compendium/store';
import { Palette } from '../../theme/colors';
import { EntrySheet } from '../compendium/EntrySheet';
import { Button, Picker, Row, Section, Stepper, useStyles } from '../ui';

type Patch = (fn: (c: Character) => Character) => void;
const COINS = ['pp', 'gp', 'ep', 'sp', 'cp'] as const;
type Coin = (typeof COINS)[number];
const CUSTOM = '__custom__';

const newKey = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Builds an inventory item from a compendium item: weight, attunement, and a linked attack for weapons. */
export function itemFromCompendium(id: string): { item: InventoryItem; weapon: Character['weapons'][number] | null } {
  const e = getEntry(id);
  const weightText = e?.fields?.find(([k]) => k === 'Weight')?.[1] ?? '';
  const weight = parseFloat(weightText) || 0;
  const isWeapon = !!getWeapon(id);
  const weaponKey = isWeapon ? newKey() : null;
  return {
    item: {
      key: newKey(), itemId: id, name: e?.name ?? id, qty: 1, weight,
      equipped: false, attuned: false, requiresAttunement: !!(e?.data as { attunement?: boolean } | undefined)?.attunement,
      note: '', weaponKey,
    },
    weapon: weaponKey ? { key: weaponKey, itemId: id, bonus: 0 } : null,
  };
}

/** Equipping armor or a shield from the bag changes AC; only one suit of armor at a time. */
function applyEquip(c: Character, item: InventoryItem, equipped: boolean): Character {
  const armor = item.itemId ? getArmor(item.itemId) : null;
  let next: Character = { ...c, inventory: c.inventory.map((x) => (x.key === item.key ? { ...x, equipped } : x)) };
  if (armor?.kind === 'shield') next = { ...next, shield: equipped };
  else if (armor) {
    next = {
      ...next,
      armorId: equipped ? armor.id : next.armorId === armor.id ? null : next.armorId,
      inventory: next.inventory.map((x) => (equipped && x.key !== item.key && x.itemId && getArmor(x.itemId) && getArmor(x.itemId)!.kind !== 'shield' ? { ...x, equipped: false } : x)),
    };
  }
  return next;
}

export function Gear({ c, d, patch }: { c: Character; d: Derived; patch: Patch }) {
  const [st, pal] = useStyles(styles);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [coin, setCoin] = useState<Coin | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const items = useMemo(
    () => [
      { value: CUSTOM, label: 'Custom item…', detail: 'Anything not in the books' },
      ...getIndex().filter((e) => e.cat === 'item').map((e) => ({ value: e.id, label: e.name, detail: e.subtitle, badge: e.source })),
    ],
    [],
  );

  const pct = Math.min(1, d.carry.weight / Math.max(1, d.carry.capacity));
  const item = c.inventory.find((x) => x.key === editing);

  return (
    <View style={{ marginTop: 12 }}>
      <View style={st.coins}>
        {COINS.map((k) => (
          <Pressable key={k} onPress={() => setCoin(k)} style={({ pressed }) => [st.coin, pressed && { opacity: 0.6 }]} accessibilityLabel={`${k.toUpperCase()} ${c.coins[k]}`}>
            <Text style={st.coinValue} numberOfLines={1} adjustsFontSizeToFit>{c.coins[k]}</Text>
            <Text style={st.coinLabel}>{k.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>

      <View style={st.meters}>
        <View style={{ flex: 1 }}>
          <Text style={st.meterLabel}>Carrying {d.carry.weight} / {d.carry.capacity} lb</Text>
          <View style={st.track}>
            <View style={[st.fill, { width: `${pct * 100}%`, backgroundColor: pct > 1 || d.carry.weight > d.carry.capacity ? pal.red : pal.accent }]} />
          </View>
        </View>
        <View style={st.attune}>
          <Text style={[st.attuneValue, d.attuned > 3 && { color: pal.red }]}>{d.attuned}/3</Text>
          <Text style={st.meterLabel}>Attuned</Text>
        </View>
      </View>

      <Section title="Items" footer="Tap an item to change quantity, equip or attune it. Equipping armor or a shield updates AC; weapons appear under Actions.">
        {c.inventory.map((it, i) => (
          <Row key={it.key} first={i === 0}
            label={it.qty > 1 ? `${it.name} ×${it.qty}` : it.name}
            detail={[it.weight ? `${Math.round(it.weight * it.qty * 100) / 100} lb` : '', it.note].filter(Boolean).join(' · ') || undefined}
            onPress={() => setEditing(it.key)}
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {it.equipped && <Text style={[st.tag, { color: pal.green, borderColor: pal.green }]}>Equipped</Text>}
                {it.attuned && <Text style={[st.tag, { color: pal.accent, borderColor: pal.accent }]}>Attuned</Text>}
                {it.requiresAttunement && !it.attuned && <Text style={[st.tag, { color: pal.secondaryLabel, borderColor: pal.separator }]}>Needs attunement</Text>}
              </View>
            } />
        ))}
        <Row first={c.inventory.length === 0} label="Add item" valueStyle={{ color: pal.accent }} onPress={() => setAdding(true)} />
      </Section>

      <Picker
        visible={adding}
        title="Add Item"
        items={items}
        value={null}
        onPick={(id) => {
          if (id === CUSTOM) return setTimeout(() => setCustom(true), 350);
          const { item: it, weapon } = itemFromCompendium(id);
          patch((x) => ({ ...x, inventory: [...x.inventory, it], weapons: weapon ? [...x.weapons, weapon] : x.weapons }));
        }}
        onClose={() => setAdding(false)}
      />

      {custom && <CustomItem onClose={() => setCustom(false)} onAdd={(name, weight) => patch((x) => ({
        ...x,
        inventory: [...x.inventory, { key: newKey(), itemId: null, name, qty: 1, weight, equipped: false, attuned: false, requiresAttunement: false, note: '', weaponKey: null }],
      }))} st={st} pal={pal} />}

      <Modal visible={!!item} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={st.scrim} onPress={() => setEditing(null)}>
            {item && (
              <Pressable style={st.card} onPress={() => {}}>
                <Text style={st.cardTitle}>{item.name}</Text>
                <View style={st.line}>
                  <Text style={st.lineLabel}>Quantity</Text>
                  <Stepper value={item.qty} min={1} max={999} onChange={(qty) => patch((x) => ({ ...x, inventory: x.inventory.map((y) => (y.key === item.key ? { ...y, qty } : y)) }))} />
                </View>
                <View style={st.line}>
                  <Text style={st.lineLabel}>Equipped</Text>
                  <Switch value={item.equipped} onValueChange={(v) => patch((x) => applyEquip(x, item, v))} />
                </View>
                {item.requiresAttunement && (
                  <View style={st.line}>
                    <Text style={st.lineLabel}>Attuned {d.attuned >= 3 && !item.attuned ? '(3 already)' : ''}</Text>
                    <Switch value={item.attuned} onValueChange={(attuned) => patch((x) => ({ ...x, inventory: x.inventory.map((y) => (y.key === item.key ? { ...y, attuned } : y)) }))} />
                  </View>
                )}
                <TextInput
                  value={item.note}
                  onChangeText={(note) => patch((x) => ({ ...x, inventory: x.inventory.map((y) => (y.key === item.key ? { ...y, note } : y)) }))}
                  placeholder="Note (charges, where it's stored…)"
                  placeholderTextColor={pal.tertiaryLabel}
                  style={st.input}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  {item.itemId && <Button kind="tinted" title="Details" style={{ flex: 1 }} onPress={() => setPreview(item.itemId)} />}
                  <Button kind="destructive" title="Remove" style={{ flex: 1 }} onPress={() => {
                    patch((x) => {
                      const off = item.equipped ? applyEquip(x, item, false) : x;
                      return { ...off, inventory: off.inventory.filter((y) => y.key !== item.key), weapons: off.weapons.filter((w) => w.key !== item.weaponKey) };
                    });
                    setEditing(null);
                  }} />
                </View>
              </Pressable>
            )}
          </Pressable>
        </KeyboardAvoidingView>
        <EntrySheet id={preview} onClose={() => setPreview(null)} />
      </Modal>

      <Modal visible={!!coin} transparent animationType="fade" onRequestClose={() => setCoin(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <Pressable style={st.scrim} onPress={() => setCoin(null)}>
            {coin && (
              <Pressable style={st.card} onPress={() => {}}>
                <Text style={st.cardTitle}>{coin.toUpperCase()}</Text>
                <TextInput
                  value={String(c.coins[coin])}
                  onChangeText={(t) => patch((x) => ({ ...x, coins: { ...x.coins, [coin]: Math.max(0, parseInt(t.replace(/\D/g, ''), 10) || 0) } }))}
                  keyboardType="number-pad"
                  style={[st.input, st.coinInput]}
                  selectTextOnFocus
                  autoFocus
                />
                <View style={st.quick}>
                  {[-10, -1, 1, 10].map((n) => (
                    <Pressable key={n} onPress={() => patch((x) => ({ ...x, coins: { ...x.coins, [coin]: Math.max(0, x.coins[coin] + n) } }))} style={st.quickBtn}>
                      <Text style={st.quickText}>{n > 0 ? `+${n}` : `−${-n}`}</Text>
                    </Pressable>
                  ))}
                </View>
                <Button title="Done" onPress={() => setCoin(null)} />
              </Pressable>
            )}
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function CustomItem({ onClose, onAdd, st, pal }: { onClose: () => void; onAdd: (name: string, weight: number) => void; st: ReturnType<typeof styles>; pal: Palette }) {
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={st.scrim} onPress={onClose}>
          <Pressable style={st.card} onPress={() => {}}>
            <Text style={st.cardTitle}>Custom Item</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={pal.tertiaryLabel} style={st.input} autoFocus />
            <TextInput value={weight} onChangeText={setWeight} placeholder="Weight in lb (optional)" placeholderTextColor={pal.tertiaryLabel} style={st.input} keyboardType="decimal-pad" />
            <Button title="Add" disabled={!name.trim()} onPress={() => { onAdd(name.trim(), parseFloat(weight) || 0); onClose(); }} />
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    coins: { flexDirection: 'row', gap: 6, marginHorizontal: 16 },
    coin: { flex: 1, backgroundColor: c.surface, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
    coinValue: { fontSize: 18, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    coinLabel: { fontSize: 11, fontWeight: '600', color: c.secondaryLabel },
    meters: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 10, marginBottom: 18, backgroundColor: c.surface, borderRadius: 12, padding: 12 },
    meterLabel: { fontSize: 13, color: c.secondaryLabel },
    track: { height: 6, borderRadius: 3, backgroundColor: c.fill, overflow: 'hidden', marginTop: 6 },
    fill: { height: 6, borderRadius: 3 },
    attune: { alignItems: 'center', minWidth: 60 },
    attuneValue: { fontSize: 20, fontWeight: '700', color: c.label },
    tag: { fontSize: 11, fontWeight: '600', borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
    scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
    card: { backgroundColor: c.surface, borderRadius: 16, padding: 18, gap: 10 },
    cardTitle: { fontSize: 18, fontWeight: '700', color: c.label },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
    lineLabel: { fontSize: 16, color: c.label },
    input: { height: 44, borderRadius: 10, backgroundColor: c.fill, paddingHorizontal: 12, fontSize: 16, color: c.label, outlineStyle: 'none' } as object,
    coinInput: { fontSize: 28, fontWeight: '700', textAlign: 'center', height: 56 },
    quick: { flexDirection: 'row', gap: 8 },
    quickBtn: { flex: 1, height: 40, borderRadius: 10, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' },
    quickText: { fontSize: 16, fontWeight: '600', color: c.accent },
  });
