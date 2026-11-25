import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatFormula, parseFormula } from '../dice/notation';
import { RollResult, createSecureRng, roll } from '../dice/roll';
import { Palette, usePalette } from '../theme/colors';

const rng = createSecureRng((a) => Crypto.getRandomValues(a));

type QuickRoll = (formula: string, label?: string) => void;
const Ctx = createContext<QuickRoll>(() => {});

/** Roll from anywhere (tapping dice in rules text, later skills/attacks) without leaving the screen. */
export const useQuickRoll = () => useContext(Ctx);

export function QuickRollProvider({ children }: { children: ReactNode }) {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<{ r: RollResult; label?: string; key: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const quickRoll = useCallback<QuickRoll>((formula, label) => {
    const f = parseFormula(formula);
    if (!f) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShown({ r: roll(f, 'normal', rng), label, key: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), 6000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={quickRoll}>
      {children}
      {shown && (
        <Animated.View key={shown.key} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(150)} style={[s.wrap, { bottom: insets.bottom + 12 }]}>
          <Pressable onPress={() => setShown(null)} style={s.card} accessibilityRole="button" accessibilityLabel={`Rolled ${shown.r.total}. Tap to dismiss`}>
            <View style={{ flex: 1 }}>
              <Text style={s.label} numberOfLines={1}>
                {shown.label ? `${shown.label} · ` : ''}
                {formatFormula(shown.r.formula)}
              </Text>
              <Text style={s.dice} numberOfLines={1}>
                {shown.r.dice.map((d) => d.value).join(' + ')}
                {shown.r.formula.modifier ? ` ${shown.r.formula.modifier > 0 ? '+' : '−'} ${Math.abs(shown.r.formula.modifier)}` : ''}
              </Text>
            </View>
            <Text style={[s.total, shown.r.crit === 'success' && { color: c.green }, shown.r.crit === 'fail' && { color: c.red }]}>{shown.r.total}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
      backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.separator,
      shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
    },
    label: { fontSize: 13, color: c.secondaryLabel },
    dice: { fontSize: 15, color: c.label, fontVariant: ['tabular-nums'], marginTop: 2 },
    total: { fontSize: 34, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
  });
