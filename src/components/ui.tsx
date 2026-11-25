/**
 * Small iOS-style building blocks (grouped lists, steppers, segmented controls, pickers).
 * Everything takes colors from the system palette so light and dark mode just work.
 */
import { router } from 'expo-router';
import { ReactNode, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalize } from '../compendium/store';
import { Palette, usePalette } from '../theme/colors';

/** Back if there is somewhere to go back to; otherwise (opened from a link) home. */
export function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function useStyles<T>(make: (c: Palette) => T): [T, Palette] {
  const c = usePalette();
  return [useMemo(() => make(c), [c, make]), c];
}

export function Section({ title, footer, children, style }: { title?: string; footer?: string; children: ReactNode; style?: ViewStyle }) {
  const [s] = useStyles(base);
  return (
    <View style={[s.section, style]}>
      {title ? <Text style={s.sectionTitle}>{title}</Text> : null}
      <View style={s.group}>{children}</View>
      {footer ? <Text style={s.footer}>{footer}</Text> : null}
    </View>
  );
}

export function Row({
  label, value, detail, onPress, onLongPress, first, right, accessibilityLabel, valueStyle,
}: {
  label: string; value?: string; detail?: string; onPress?: () => void; onLongPress?: () => void; first?: boolean;
  right?: ReactNode; accessibilityLabel?: string; valueStyle?: object;
}) {
  const [s] = useStyles(base);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [s.row, !first && s.rowDivider, pressed && s.pressed]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.rowLabel} numberOfLines={1}>{label}</Text>
        {detail ? <Text style={s.rowDetail} numberOfLines={2}>{detail}</Text> : null}
      </View>
      {value !== undefined ? <Text style={[s.rowValue, valueStyle]} numberOfLines={1}>{value}</Text> : null}
      {right}
      {onPress && !right ? <Text style={s.chevron}>›</Text> : null}
    </Pressable>
  );
}

export function Stepper({ value, onChange, min = -Infinity, max = Infinity, format }: { value: number; onChange: (v: number) => void; min?: number; max?: number; format?: (v: number) => string }) {
  const [s] = useStyles(base);
  return (
    <View style={s.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} style={s.stepBtn} hitSlop={6} accessibilityLabel="Decrease">
        <Text style={[s.stepGlyph, value <= min && s.disabled]}>−</Text>
      </Pressable>
      <Text style={s.stepValue}>{format ? format(value) : value}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} style={s.stepBtn} hitSlop={6} accessibilityLabel="Increase">
        <Text style={[s.stepGlyph, value >= max && s.disabled]}>+</Text>
      </Pressable>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange, style }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; style?: ViewStyle }) {
  const [s] = useStyles(base);
  return (
    <View style={[s.segment, style]}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, value === o.value && s.segItemOn]} accessibilityState={{ selected: value === o.value }}>
          <Text style={[s.segText, value === o.value && s.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export interface PickerItem {
  value: string;
  label: string;
  detail?: string;
  badge?: string;
}

/** Full-height searchable list in a sheet. Search appears only when the list is long. */
export function Picker({ visible, title, items, value, onPick, onClose }: { visible: boolean; title: string; items: PickerItem[]; value: string | null; onPick: (v: string) => void; onClose: () => void }) {
  const [s, c] = useStyles(base);
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const n = normalize(q);
    return n ? items.filter((i) => normalize(i.label).includes(n)) : items;
  }, [items, q]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
        <View style={s.pickerHead}>
          <Text style={s.pickerTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={s.link}>Done</Text>
          </Pressable>
        </View>
        {items.length > 12 && (
          <View style={s.searchField}>
            <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={c.secondaryLabel} style={s.searchInput} autoCorrect={false} />
          </View>
        )}
        <FlatList
          data={shown}
          keyExtractor={(i) => i.value}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => {
                onPick(item.value);
                setQ('');
                onClose();
              }}
              style={({ pressed }) => [s.pickRow, index > 0 && s.rowDivider, pressed && s.pressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>{item.label}</Text>
                {item.detail ? <Text style={s.rowDetail}>{item.detail}</Text> : null}
              </View>
              {item.badge ? <Text style={s.badge}>{item.badge}</Text> : null}
              {item.value === value ? <Text style={s.check}>✓</Text> : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

export function Button({ title, onPress, kind = 'filled', style, disabled }: { title: string; onPress: () => void; kind?: 'filled' | 'tinted' | 'plain' | 'destructive'; style?: ViewStyle; disabled?: boolean }) {
  const [s] = useStyles(base);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, s[`btn_${kind}`], pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }, style]}
      accessibilityRole="button"
    >
      <Text style={[s.btnText, s[`btnText_${kind}`]]}>{title}</Text>
    </Pressable>
  );
}

export const base = (c: Palette) =>
  StyleSheet.create({
    section: { marginHorizontal: 16, marginBottom: 22 },
    sectionTitle: { fontSize: 13, color: c.secondaryLabel, textTransform: 'uppercase', marginBottom: 6, marginLeft: 16, letterSpacing: 0.2 },
    group: { backgroundColor: c.surface, borderRadius: 12, overflow: 'hidden' },
    footer: { fontSize: 13, color: c.secondaryLabel, marginTop: 6, marginHorizontal: 16, lineHeight: 18 },
    row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    pressed: { backgroundColor: c.fill },
    rowLabel: { fontSize: 17, color: c.label },
    rowDetail: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    rowValue: { fontSize: 17, color: c.secondaryLabel, fontVariant: ['tabular-nums'], maxWidth: '55%' },
    chevron: { fontSize: 22, color: c.tertiaryLabel, marginTop: -2 },
    stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 9 },
    stepBtn: { width: 38, height: 32, alignItems: 'center', justifyContent: 'center' },
    stepGlyph: { fontSize: 20, color: c.label, fontWeight: '500' },
    stepValue: { minWidth: 30, textAlign: 'center', fontSize: 16, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'] },
    disabled: { opacity: 0.3 },
    segment: { flexDirection: 'row', backgroundColor: c.fill, borderRadius: 9, padding: 2 },
    segItem: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
    segItemOn: { backgroundColor: c.fillStrong },
    segText: { fontSize: 13, fontWeight: '500', color: c.secondaryLabel },
    segTextOn: { color: c.label, fontWeight: '600' },
    pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    pickerTitle: { fontSize: 17, fontWeight: '600', color: c.label },
    link: { fontSize: 17, color: c.accent, fontWeight: '600' },
    searchField: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.fill, borderRadius: 10, height: 36, justifyContent: 'center', paddingHorizontal: 10 },
    searchInput: { fontSize: 17, color: c.label, paddingVertical: 0, outlineStyle: 'none' } as object,
    pickRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.background },
    badge: { fontSize: 12, color: c.tertiaryLabel, marginLeft: 8, fontWeight: '500' },
    check: { fontSize: 17, color: c.accent, marginLeft: 10, fontWeight: '700' },
    btn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    btn_filled: { backgroundColor: c.accent },
    btn_tinted: { backgroundColor: c.fill },
    btn_plain: {},
    btn_destructive: { backgroundColor: c.fill },
    btnText: { fontSize: 17, fontWeight: '600' },
    btnText_filled: { color: c.onAccent },
    btnText_tinted: { color: c.accent },
    btnText_plain: { color: c.accent },
    btnText_destructive: { color: c.red },
  });
