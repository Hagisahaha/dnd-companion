/*
 * Dice rendering uses an imperative, mutable controller shared with the three.js render
 * loop (it works like a ref: poses are written 60×/s without re-rendering). That pattern is
 * outside React Compiler's model, so this file opts out of the compiler and its lint rules.
 */
/* eslint-disable react-hooks/immutability, react-hooks/purity */
'use no memo';
import { Canvas } from '@react-three/fiber';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import { DIE_SIDES, DieSides, DiceFormula, formatFormula, formulaFromHand } from '../../dice/notation';
import { toPhysical } from '../../dice/physical';
import { RollMode, RollResult, createSecureRng, rerollDie, roll } from '../../dice/roll';
import { simulateThrow } from '../../dice/simulate';
import { useRollMode } from '../../state/roll';
import { Palette, usePalette } from '../../theme/colors';
import { CAMERA_FOV, CAMERA_HEIGHT, DiceScene, SceneDie, createController } from './DiceScene';
import { DieGlyph } from './DieGlyph';

const rng = createSecureRng((a) => Crypto.getRandomValues(a));
const DEFAULT_FORMULA: DiceFormula = { terms: [{ count: 1, sides: 20, sign: 1 }], modifier: 0 };
const HOLD_DELAY_MS = 160;
const MOVE_SLOP = 8;

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
}

let keySeq = 0;
const sceneDice = (formula: DiceFormula, mode: RollMode): SceneDie[] =>
  toPhysical(roll(formula, mode, () => 1).dice).map((d) => ({ key: `k${keySeq++}`, kind: d.kind }));

export function DiceTray() {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);

  const [hand, setHand] = useState<DieSides[]>([]);
  const [modifier, setModifier] = useState(0);
  const mode = useRollMode((st) => st.mode);
  const setMode = useRollMode((st) => st.set);
  const [last, setLast] = useState<DiceFormula>(DEFAULT_FORMULA);
  const [result, setResult] = useState<RollResult | null>(null);
  const [settled, setSettled] = useState(true);
  const [dice, setDice] = useState<SceneDie[]>(() => sceneDice(DEFAULT_FORMULA, 'normal'));

  // Opening pose: one d20 resting in the middle, inviting a flick.
  const [ctrl] = useState(() => createController([{ p: [0, 1.0, 1], q: [0.31, 0.12, 0.2, 0.92] }]));
  const size = useRef({ w: 1, h: 1 });
  const lastImpact = useRef(0);

  const formula = useMemo(() => (hand.length ? formulaFromHand(hand, modifier) : { ...last, modifier }), [hand, last, modifier]);

  const bounds = useCallback((): [number, number] => {
    const halfZ = Math.tan(((CAMERA_FOV / 2) * Math.PI) / 180) * CAMERA_HEIGHT;
    const halfX = (halfZ * size.current.w) / size.current.h;
    // Dice stand ~1.2 units tall; perspective pushes their tops outward, so pull walls in.
    const k = 1 - 1.4 / CAMERA_HEIGHT;
    return [halfX * k - 0.15, halfZ * k - 0.15];
  }, []);

  const toWorld = useCallback(
    (px: number, py: number) => {
      const [bx, bz] = bounds();
      return { x: (px / size.current.w - 0.5) * 2 * bx, z: (py / size.current.h - 0.5) * 2 * bz };
    },
    [bounds],
  );

  useEffect(() => {
    ctrl.onImpact = (strength) => {
      const now = Date.now();
      if (now - lastImpact.current < 45) return;
      lastImpact.current = now;
      haptic(strength > 12 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    };
    ctrl.onSettled = () => setSettled(true);
  }, [ctrl]);

  // ---- gesture: hold to lift, drag to carry, flick to throw ----
  const g = useRef({ x0: 0, y0: 0, lifted: false, timer: 0 as unknown as ReturnType<typeof setTimeout>, samples: [] as { x: number; y: number; t: number }[] });

  const lift = useCallback(
    (px: number, py: number) => {
      if (g.current.lifted || ctrl.phase === 'playing') return;
      g.current.lifted = true;
      ctrl.hand = toWorld(px, py);
      const next = sceneDice(formula, mode);
      ctrl.poses = next.map(() => ({ p: [ctrl.hand.x, 2.8, ctrl.hand.z], q: [0, 0, 0, 1] }));
      ctrl.phase = 'holding';
      setDice(next);
      setSettled(false);
      setResult(null);
      haptic(Haptics.ImpactFeedbackStyle.Soft);
    },
    [ctrl, formula, mode, toWorld],
  );

  const release = useCallback(
    (vx: number, vy: number) => {
      if (ctrl.phase !== 'holding') return;
      const [bx, bz] = bounds();
      const scale = (2 * bx) / size.current.w;
      let wx = vx * scale;
      let wz = vy * scale;
      const speed = Math.hypot(wx, wz);
      const MIN = 7;
      const MAX = 42;
      if (speed < MIN) {
        // A gentle drop still tumbles: nudge toward the tray centre.
        const a = Math.atan2(-ctrl.hand.z, -ctrl.hand.x);
        wx = Math.cos(a) * MIN;
        wz = Math.sin(a) * MIN;
      } else if (speed > MAX) {
        wx *= MAX / speed;
        wz *= MAX / speed;
      }
      const r = roll(formula, useRollMode.getState().consume(), rng);
      const physical = toPhysical(r.dice);
      const track = simulateThrow({
        dice: physical.map((d, i) => ({
          kind: d.kind,
          value: d.value,
          start: [
            Math.max(-bx + 1, Math.min(bx - 1, ctrl.poses[i].p[0])),
            ctrl.poses[i].p[1],
            Math.max(-bz + 1, Math.min(bz - 1, ctrl.poses[i].p[2])),
          ],
          rotation: ctrl.poses[i].q,
        })),
        velocity: [wx, wz],
        bounds: [bx, bz],
      });
      ctrl.track = track;
      ctrl.trackMap = physical.map((_, i) => i);
      ctrl.trackStart = performance.now();
      ctrl.impactCursor = 0;
      ctrl.phase = 'playing';
      if (hand.length) setLast(formulaFromHand(hand, 0));
      setHand([]);
      setResult(r);
    },
    [bounds, ctrl, formula, hand],
  );

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => {
      g.current.x0 = e.x;
      g.current.y0 = e.y;
      g.current.lifted = false;
      g.current.samples = [{ x: e.x, y: e.y, t: Date.now() }];
      clearTimeout(g.current.timer);
      g.current.timer = setTimeout(() => lift(g.current.x0, g.current.y0), HOLD_DELAY_MS);
    },
    onUpdate: (e) => {
      const sm = g.current.samples;
      sm.push({ x: e.x, y: e.y, t: Date.now() });
      if (sm.length > 6) sm.shift();
      if (!g.current.lifted && Math.hypot(e.x - g.current.x0, e.y - g.current.y0) > MOVE_SLOP) {
        clearTimeout(g.current.timer);
        lift(g.current.x0, g.current.y0);
      }
      if (g.current.lifted && ctrl.phase === 'holding') ctrl.hand = toWorld(e.x, e.y);
    },
    onFinalize: () => {
      clearTimeout(g.current.timer);
      if (!g.current.lifted) return;
      g.current.lifted = false;
      // Velocity from the last few samples is steadier than one event's delta.
      const sm = g.current.samples;
      const a = sm[0];
      const b = sm[sm.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      const recent = Date.now() - b.t < 80;
      release(recent ? (b.x - a.x) / dt : 0, recent ? (b.y - a.y) / dt : 0);
    },
  });

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
  };

  const addDie = (sides: DieSides) => {
    if (hand.length >= 20) return;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setHand((h) => [...h, sides]);
  };
  const removeDie = (sides: DieSides) => {
    setHand((h) => {
      const i = h.lastIndexOf(sides);
      return i < 0 ? h : [...h.slice(0, i), ...h.slice(i + 1)];
    });
  };

  const rerollOne = (dieId: string) => {
    if (!result || !settled) return;
    const next = rerollDie(result, dieId, rng);
    const before = toPhysical(result.dice);
    const after = toPhysical(next.dice);
    const moving = after.map((d, i) => (d.dieId === dieId ? i : -1)).filter((i) => i >= 0);
    const [bx, bz] = bounds();
    const track = simulateThrow({
      dice: moving.map((i) => ({ kind: after[i].kind, value: after[i].value, start: [ctrl.poses[i].p[0], 2.5, ctrl.poses[i].p[2]] })),
      velocity: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10],
      bounds: [bx, bz],
    });
    ctrl.track = track;
    ctrl.trackMap = before.map((_, i) => moving.indexOf(i));
    ctrl.trackStart = performance.now();
    ctrl.impactCursor = 0;
    ctrl.phase = 'playing';
    setSettled(false);
    setResult(next);
    haptic(Haptics.ImpactFeedbackStyle.Light);
  };

  const counts = useMemo(() => {
    const m = new Map<DieSides, number>();
    hand.forEach((d) => m.set(d, (m.get(d) ?? 0) + 1));
    return m;
  }, [hand]);

  const showResult = result && settled;
  const critColor = result?.crit === 'success' ? c.green : result?.crit === 'fail' ? c.red : c.label;

  return (
    <View style={s.root}>
      <GestureDetector gesture={pan}>
        <View style={s.tray} onLayout={onLayout}>
          <Canvas shadows camera={{ fov: CAMERA_FOV, near: 1, far: 80, position: [0, CAMERA_HEIGHT, 0] }} style={StyleSheet.absoluteFill}>
            <color attach="background" args={[c.tray]} />
            <Suspense fallback={null}>
              <DiceScene dice={dice} ctrl={ctrl} skin="#FFFFFF" />
            </Suspense>
          </Canvas>

        </View>
      </GestureDetector>

      <View style={s.resultBox}>
          {showResult ? (
            <>
              <Text style={[s.total, { color: critColor }]}>{result.total}</Text>
              <Text style={s.formula}>
                {formatFormula(result.formula)}
                {result.mode !== 'normal' ? `  ·  ${result.mode === 'advantage' ? 'ADV' : 'DIS'}` : ''}
              </Text>
              <View style={s.breakdown}>
                {result.dice.map((d) => (
                  <Pressable key={d.id} onPress={() => rerollOne(d.id)} style={[s.chip, d.dropped && s.chipDropped]} hitSlop={4}>
                    <Text style={[s.chipText, d.dropped && s.chipTextDropped]}>
                      {d.sign < 0 ? '−' : ''}
                      {d.value}
                    </Text>
                    <Text style={s.chipSub}>d{d.sides}{d.rerolls ? ' ↻' : ''}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : !result && ctrl.phase === 'rest' ? (
            <Text style={s.hint}>Flick to roll {formatFormula(formula)}</Text>
          ) : null}
        </View>

      <View style={s.controls}>
        <View style={s.row}>
          <View style={s.segment}>
            {(['advantage', 'normal', 'disadvantage'] as RollMode[]).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)} style={[s.segItem, mode === m && s.segItemOn]}>
                <Text style={[s.segText, mode === m && s.segTextOn]}>{m === 'advantage' ? 'ADV' : m === 'normal' ? 'Normal' : 'DIS'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.stepper}>
            <Pressable onPress={() => setModifier((v) => v - 1)} style={s.stepBtn} hitSlop={6}>
              <Text style={s.stepGlyph}>−</Text>
            </Pressable>
            <Text style={s.stepValue}>{modifier >= 0 ? `+${modifier}` : `−${-modifier}`}</Text>
            <Pressable onPress={() => setModifier((v) => v + 1)} style={s.stepBtn} hitSlop={6}>
              <Text style={s.stepGlyph}>+</Text>
            </Pressable>
          </View>
        </View>

        <View style={s.handRow}>
          <Text style={s.handText} numberOfLines={1}>
            {hand.length ? formatFormula(formula) : `Last: ${formatFormula(formula)}`}
          </Text>
          {hand.length > 0 && (
            <Pressable onPress={() => setHand([])} hitSlop={8}>
              <Text style={s.clear}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={s.diceBar}>
          {DIE_SIDES.map((sides) => {
            const n = counts.get(sides) ?? 0;
            return (
              <Pressable
                key={sides}
                onPress={() => addDie(sides)}
                onLongPress={() => removeDie(sides)}
                style={({ pressed }) => [s.dieBtn, n > 0 && s.dieBtnOn, pressed && { opacity: 0.6 }]}
                accessibilityLabel={`Add d${sides}`}
              >
                <DieGlyph sides={sides} size={26} color={n > 0 ? c.accent : c.label} />
                <Text style={[s.dieLabel, n > 0 && { color: c.accent }]}>{sides === 100 ? 'd%' : `d${sides}`}</Text>
                {n > 0 && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{n}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    tray: { flex: 1, backgroundColor: c.tray, borderRadius: 20, overflow: 'hidden', marginHorizontal: 8 },
    resultBox: { height: 132, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8, marginBottom: 6 },
    total: { fontSize: 48, lineHeight: 54, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
    formula: { fontSize: 13, color: c.secondaryLabel },
    breakdown: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6, paddingHorizontal: 16, maxHeight: 40, overflow: 'hidden' },
    chip: { minWidth: 40, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: c.fill, alignItems: 'center' },
    chipDropped: { opacity: 0.45 },
    chipText: { fontSize: 17, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'] },
    chipTextDropped: { textDecorationLine: 'line-through' },
    chipSub: { fontSize: 11, color: c.secondaryLabel },
    hint: { fontSize: 15, color: c.secondaryLabel },
    controls: { paddingHorizontal: 12, paddingBottom: 8, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    segment: { flexDirection: 'row', backgroundColor: c.fill, borderRadius: 9, padding: 2, flex: 1 },
    segItem: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
    segItemOn: { backgroundColor: c.fillStrong },
    segText: { fontSize: 13, fontWeight: '500', color: c.secondaryLabel },
    segTextOn: { color: c.label, fontWeight: '600' },
    stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 9 },
    stepBtn: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
    stepGlyph: { fontSize: 20, color: c.label, fontWeight: '500' },
    stepValue: { minWidth: 34, textAlign: 'center', fontSize: 15, fontWeight: '600', color: c.label, fontVariant: ['tabular-nums'] },
    handRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20, paddingHorizontal: 4 },
    handText: { fontSize: 15, color: c.secondaryLabel, flex: 1 },
    clear: { fontSize: 15, color: c.accent },
    diceBar: { flexDirection: 'row', justifyContent: 'space-between' },
    dieBtn: { width: 48, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
    dieBtnOn: { backgroundColor: c.fill },
    dieLabel: { fontSize: 12, fontWeight: '500', color: c.label },
    badge: {
      position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    badgeText: { color: c.onAccent, fontSize: 11, fontWeight: '700' },
  });
