import { Canvas } from '@react-three/fiber';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, Suspense, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatFormula, parseFormula } from '../dice/notation';
import { toPhysical } from '../dice/physical';
import { RollMode, RollResult, createSecureRng, roll } from '../dice/roll';
import { simulateThrow } from '../dice/simulate';
import { useRollMode } from '../state/roll';
import { Palette, usePalette } from '../theme/colors';
import { CAMERA_FOV, CAMERA_HEIGHT, DiceScene, SceneDie, createController } from './dice/DiceScene';

const rng = createSecureRng((a) => Crypto.getRandomValues(a));

export interface QuickRollOptions {
  label?: string;
  /** 'shared' reads (and resets) the ADV/DIS toggle; use it for d20 tests. */
  mode?: RollMode | 'shared';
  /** Follow-up shown on the result card, e.g. roll damage after an attack. */
  then?: { label: string; formula: string };
}
type QuickRoll = (formula: string, opts?: QuickRollOptions) => void;
const Ctx = createContext<QuickRoll>(() => {});

/** Roll from anywhere (sheet, rules text) on a 3D overlay, without leaving the screen. */
export const useQuickRoll = () => useContext(Ctx);

let seq = 0;

export function QuickRollProvider({ children }: { children: ReactNode }) {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [shown, setShown] = useState<{ r: RollResult; opts: QuickRollOptions; dice: SceneDie[]; settled: boolean; key: number } | null>(null);
  const ctrl = useRef(createController()).current;
  const lastImpact = useRef(0);

  const bounds = useCallback((): [number, number] => {
    const halfZ = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180) * CAMERA_HEIGHT;
    const k = 1 - 1.4 / CAMERA_HEIGHT;
    return [((halfZ * width) / height) * k - 0.15, halfZ * k - 0.15];
  }, [width, height]);

  const quickRoll = useCallback<QuickRoll>(
    (formula, opts = {}) => {
      const f = parseFormula(formula);
      if (!f) return;
      const mode = opts.mode === 'shared' ? useRollMode.getState().consume() : opts.mode ?? 'normal';
      const r = roll(f, mode, rng);
      const physical = toPhysical(r.dice);
      const [bx, bz] = bounds();
      // Thrown from just below the screen's bottom edge, toward the upper middle.
      const track = simulateThrow({
        dice: physical.map((d, i) => ({
          kind: d.kind,
          value: d.value,
          start: [Math.max(-bx + 1, Math.min(bx - 1, (i - (physical.length - 1) / 2) * 1.6)), 3, bz - 1.2],
        })),
        velocity: [(Math.random() - 0.5) * 8, -26 - Math.random() * 8],
        bounds: [bx, bz],
      });
      ctrl.poses = physical.map(() => ({ p: [0, -10, 0], q: [0, 0, 0, 1] }));
      ctrl.track = track;
      ctrl.trackMap = physical.map((_, i) => i);
      ctrl.trackStart = performance.now();
      ctrl.impactCursor = 0;
      ctrl.phase = 'playing';
      const key = ++seq;
      ctrl.onSettled = () => {
        setShown((cur) => (cur && cur.key === key ? { ...cur, settled: true } : cur));
        if (Platform.OS !== 'web')
          Haptics.notificationAsync(r.crit === 'fail' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success).catch(() => {});
      };
      ctrl.onImpact = (strength) => {
        const now = Date.now();
        if (Platform.OS === 'web' || now - lastImpact.current < 45) return;
        lastImpact.current = now;
        Haptics.impactAsync(strength > 12 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      };
      setShown({ r, opts, dice: physical.map((d, i) => ({ key: `q${key}-${i}`, kind: d.kind })), settled: false, key });
    },
    [bounds, ctrl],
  );

  const close = () => {
    ctrl.phase = 'rest';
    setShown(null);
  };

  return (
    <Ctx.Provider value={quickRoll}>
      {children}
      {shown && (
        <Animated.View entering={FadeIn.duration(120)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={close} accessibilityLabel="Dismiss roll">
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Canvas
              shadows
              camera={{ fov: CAMERA_FOV, near: 1, far: 80, position: [0, CAMERA_HEIGHT, 0] }}
              style={StyleSheet.absoluteFill}
              gl={{ alpha: true }}
            >
              <Suspense fallback={null}>
                <DiceScene dice={shown.dice} ctrl={ctrl} skin="#FFFFFF" />
              </Suspense>
            </Canvas>
            </View>
          </Pressable>
          {shown.settled && (
            <Animated.View entering={FadeInDown.duration(160)} style={[s.cardWrap, { bottom: insets.bottom + 16 }]} pointerEvents="box-none">
              <View style={s.card}>
                <View style={{ flex: 1 }}>
                  <Text style={s.label} numberOfLines={1}>
                    {shown.opts.label ? `${shown.opts.label} · ` : ''}
                    {formatFormula(shown.r.formula)}
                    {shown.r.mode !== 'normal' ? (shown.r.mode === 'advantage' ? ' · ADV' : ' · DIS') : ''}
                  </Text>
                  <Text style={s.dice} numberOfLines={1}>
                    {shown.r.dice.map((d) => (d.dropped ? `(${d.value})` : String(d.value))).join(' + ')}
                    {shown.r.formula.modifier ? ` ${shown.r.formula.modifier > 0 ? '+' : '−'} ${Math.abs(shown.r.formula.modifier)}` : ''}
                  </Text>
                </View>
                <Text style={[s.total, shown.r.crit === 'success' && { color: c.green }, shown.r.crit === 'fail' && { color: c.red }]}>{shown.r.total}</Text>
              </View>
              {shown.opts.then && (
                <Pressable
                  style={({ pressed }) => [s.then, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    const t = shown.opts.then!;
                    // A natural 20 doubles the damage dice (2024: roll the dice twice).
                    const f = parseFormula(t.formula);
                    const crit = shown.r.crit === 'success' && f;
                    const formula = crit ? formatFormula({ ...f, terms: f.terms.map((x) => ({ ...x, count: x.count * 2 })) }).replace(/\s/g, '') : t.formula;
                    quickRoll(formula, { label: crit ? `${t.label} (crit)` : t.label });
                  }}
                >
                  <Text style={s.thenText}>{shown.r.crit === 'success' ? `${shown.opts.then.label} · Critical` : shown.opts.then.label}</Text>
                </Pressable>
              )}
            </Animated.View>
          )}
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
    cardWrap: { position: 'absolute', left: 12, right: 12, gap: 8 },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16,
      backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.separator,
    },
    label: { fontSize: 13, color: c.secondaryLabel },
    dice: { fontSize: 15, color: c.label, fontVariant: ['tabular-nums'], marginTop: 2 },
    total: { fontSize: 38, fontWeight: '700', color: c.label, fontVariant: ['tabular-nums'] },
    then: { height: 48, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    thenText: { color: c.onAccent, fontSize: 17, fontWeight: '600' },
  });
