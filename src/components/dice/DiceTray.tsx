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
import { ComponentRef, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, useExclusiveGestures, useLongPressGesture, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { useCharacters } from '../../character/store';
import { DIE_SIDES, DieSides, DiceFormula, formatFormula, formulaFromHand, parseFormula } from '../../dice/notation';
import { toPhysical } from '../../dice/physical';
import { RollMode, RollResult, createSecureRng, rerollDie, roll } from '../../dice/roll';
import { Preset, useRollLog } from '../../state/history';
import { useRollMode } from '../../state/roll';
import { Palette, usePalette } from '../../theme/colors';
import { CAMERA_FOV, CAMERA_HEIGHT, DiceScene, SceneDie, createController, startThrow } from './DiceScene';
import { DieGlyph } from './DieGlyph';
import { PresetEditor } from './PresetEditor';

const rng = createSecureRng((a) => Crypto.getRandomValues(a));
const DEFAULT_FORMULA: DiceFormula = { terms: [{ count: 1, sides: 20, sign: 1 }], modifier: 0 };
const HOLD_DELAY_MS = 160;
const MOVE_SLOP = 8;
const MAX_HAND = 30;

const activeName = () => {
  const st = useCharacters.getState();
  return st.activeId ? st.characters[st.activeId]?.name ?? null : null;
};

function haptic(style: Haptics.ImpactFeedbackStyle) {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(style).catch(() => {});
}

// Stable keys (kind + position) let React reuse the dice meshes between throws instead of remounting them.
const sceneDice = (formula: DiceFormula, mode: RollMode): SceneDie[] =>
  toPhysical(roll(formula, mode, () => 1).dice).map((d, i) => ({ key: `${d.kind}-${i}`, kind: d.kind }));

type Sample = { x: number; y: number; t: number };
/** Fling velocity (px/s) from the last few touch samples; 0 if the finger stopped before lifting. */
function velocityOf(sm: Sample[]): [number, number] {
  if (sm.length < 2) return [0, 0];
  const a = sm[0];
  const b = sm[sm.length - 1];
  if (Date.now() - b.t > 80) return [0, 0];
  const dt = Math.max(1, b.t - a.t) / 1000;
  return [(b.x - a.x) / dt, (b.y - a.y) / dt];
}

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
  const presets = useRollLog((st) => st.presets);
  const [editing, setEditing] = useState<Preset | 'new' | null>(null);
  /** Name of the preset currently in hand, so the log says "Fireball" rather than "8d6". */
  const [presetLabel, setPresetLabel] = useState<string | null>(null);

  // Opening pose: one d20 resting in the middle, inviting a flick.
  const [ctrl] = useState(() => createController([{ p: [0, 1.0, 1], q: [0.31, 0.12, 0.2, 0.92] }]));
  const size = useRef({ w: 1, h: 1 });
  /** Tray's top-left in window coordinates, so drags starting on the dice bar map into the tray. */
  const origin = useRef({ x: 0, y: 0 });
  const trayRef = useRef<ComponentRef<typeof View>>(null);
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
      const clamp = (v: number, m: number) => Math.max(-m + 0.8, Math.min(m - 0.8, v));
      // Clamped so dice carried up from the dice bar wait at the tray's bottom edge.
      return { x: clamp((px / size.current.w - 0.5) * 2 * bx, bx), z: clamp((py / size.current.h - 0.5) * 2 * bz, bz) };
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
  const g = useRef({
    x0: 0, y0: 0, lifted: false, timer: 0 as unknown as ReturnType<typeof setTimeout>, samples: [] as Sample[],
    /** What was picked up, fixed at lift time so taps during the carry can't change the throw. */
    formula: null as DiceFormula | null, used: [] as DieSides[],
  });

  /** Picks the dice up at a point in the tray. `extra` adds one die (a swipe that starts on the dice bar). */
  const lift = useCallback(
    (px: number, py: number, extra?: DieSides) => {
      if (g.current.lifted) return;
      // Lifting interrupts a throw that is still rolling: no waiting for dice to settle.
      g.current.lifted = true;
      const used = extra ? [...hand, extra].slice(0, MAX_HAND) : hand;
      const f = used.length ? formulaFromHand(used, modifier) : { ...last, modifier };
      g.current.formula = f;
      g.current.used = used;
      ctrl.track = null;
      ctrl.hand = toWorld(px, py);
      const next = sceneDice(f, mode);
      ctrl.poses = next.map(() => ({ p: [ctrl.hand.x, 2.8, ctrl.hand.z], q: [0, 0, 0, 1] }));
      ctrl.phase = 'holding';
      setDice(next);
      setSettled(false);
      setResult(null);
      haptic(Haptics.ImpactFeedbackStyle.Soft);
    },
    [ctrl, hand, last, modifier, mode, toWorld],
  );

  const release = useCallback(
    (vx: number, vy: number) => {
      if (ctrl.phase !== 'holding' || !g.current.formula) return;
      const thrown = g.current.formula;
      const used = g.current.used;
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
      const r = roll(thrown, useRollMode.getState().consume(), rng);
      const physical = toPhysical(r.dice);
      startThrow(
        ctrl,
        {
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
        },
        physical.map((_, i) => i),
      );
      // React updates and the history write wait a frame, so nothing competes with the dice leaving the hand.
      const label = used.length && used.length === hand.length ? presetLabel : null;
      requestAnimationFrame(() => {
        if (used.length) setLast(formulaFromHand(used, 0));
        setHand([]);
        setResult(r);
        setPresetLabel(null);
        setTimeout(() => useRollLog.getState().record(r, label, activeName()), 250);
      });
    },
    [bounds, ctrl, hand, presetLabel],
  );

  // Drags that start on a dice-bar icon arrive in window coordinates.
  const carryFromBar = {
    start: (ax: number, ay: number, sides: DieSides) => {
      g.current.samples = [{ x: ax, y: ay, t: Date.now() }];
      lift(ax - origin.current.x, ay - origin.current.y, sides);
    },
    move: (ax: number, ay: number) => {
      const sm = g.current.samples;
      sm.push({ x: ax, y: ay, t: Date.now() });
      if (sm.length > 6) sm.shift();
      if (g.current.lifted && ctrl.phase === 'holding') ctrl.hand = toWorld(ax - origin.current.x, ay - origin.current.y);
    },
    end: () => {
      if (!g.current.lifted) return;
      g.current.lifted = false;
      release(...velocityOf(g.current.samples));
    },
  };

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
      release(...velocityOf(g.current.samples));
    },
  });

  const onLayout = (e: LayoutChangeEvent) => {
    size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    trayRef.current?.measureInWindow((x, y) => {
      origin.current = { x, y };
    });
  };

  const addDie = (sides: DieSides) => {
    if (hand.length >= MAX_HAND) return;
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setPresetLabel(null);
    setHand((h) => [...h, sides]);
  };
  const removeDie = (sides: DieSides) => {
    setPresetLabel(null);
    setHand((h) => {
      const i = h.lastIndexOf(sides);
      return i < 0 ? h : [...h.slice(0, i), ...h.slice(i + 1)];
    });
  };

  /** Puts a preset into the hand, ready to flick. Subtracted dice can't be held, so those presets are refused. */
  const loadPreset = (p: Preset) => {
    const f = parseFormula(p.formula);
    if (!f || f.terms.some((t) => t.sign < 0)) return;
    const dice: DieSides[] = f.terms.flatMap((t) => Array.from({ length: t.count }, () => t.sides)).slice(0, MAX_HAND);
    haptic(Haptics.ImpactFeedbackStyle.Light);
    setHand(dice);
    setModifier(f.modifier);
    setPresetLabel(p.name);
  };

  const rerollOne = (dieId: string) => {
    if (!result || !settled) return;
    const next = rerollDie(result, dieId, rng);
    const before = toPhysical(result.dice);
    const after = toPhysical(next.dice);
    const moving = after.map((d, i) => (d.dieId === dieId ? i : -1)).filter((i) => i >= 0);
    const [bx, bz] = bounds();
    startThrow(
      ctrl,
      {
        dice: moving.map((i) => ({ kind: after[i].kind, value: after[i].value, start: [ctrl.poses[i].p[0], 2.5, ctrl.poses[i].p[2]] })),
        velocity: [(Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10],
        bounds: [bx, bz],
      },
      before.map((_, i) => moving.indexOf(i)),
    );
    setSettled(false);
    setResult(next);
    useRollLog.getState().replace(next);
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
        <View style={s.tray} onLayout={onLayout} ref={trayRef}>
          <Canvas shadows camera={{ fov: CAMERA_FOV, near: 1, far: 80, position: [0, CAMERA_HEIGHT, 0] }} style={StyleSheet.absoluteFill}>
            <color attach="background" args={[c.tray]} />
            <Suspense fallback={null}>
              <DiceScene dice={dice} ctrl={ctrl} skin="#FFFFFF" />
            </Suspense>
          </Canvas>

        </View>
      </GestureDetector>

      <View style={s.diceBar}>
        {DIE_SIDES.map((sides) => (
          <DieButton
            key={sides}
            sides={sides}
            count={counts.get(sides) ?? 0}
            onAdd={() => addDie(sides)}
            onRemove={() => removeDie(sides)}
            carry={carryFromBar}
            s={s}
            c={c}
          />
        ))}
      </View>

      <View style={s.resultBox}>
          {showResult ? (
            <>
              <Text style={[s.total, { color: critColor }]}>{result.total}</Text>
              <Text style={s.formula}>
                {formatFormula(result.formula)}
                {result.mode !== 'normal' ? `  ·  ${result.mode === 'advantage' ? 'ADV' : 'DIS'}` : ''}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.breakdownScroll} contentContainerStyle={s.breakdown}>
                {result.dice.map((d) => (
                  <Pressable key={d.id} onPress={() => rerollOne(d.id)} style={[s.chip, d.dropped && s.chipDropped]} hitSlop={4}>
                    <Text style={[s.chipText, d.dropped && s.chipTextDropped]}>
                      {d.sign < 0 ? '−' : ''}
                      {d.value}
                    </Text>
                    <Text style={s.chipSub}>d{d.sides}{d.rerolls ? ' ↻' : ''}</Text>
                  </Pressable>
                ))}
              </ScrollView>
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
            {hand.length ? formatFormula(formula) : 'Swipe a die up to roll it · tap to add'}
          </Text>
          {hand.length > 0 || modifier !== 0 ? (
            <Pressable onPress={() => { setHand([]); setModifier(0); }} hitSlop={8}>
              <Text style={s.clear}>Clear</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push('/history')} hitSlop={8} accessibilityLabel="Roll history">
              <Text style={s.clear}>History</Text>
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presets} style={s.presetBar}>
          {presets.map((p) => (
            <Pressable key={p.id} onPress={() => loadPreset(p)} onLongPress={() => setEditing(p)} style={({ pressed }) => [s.preset, pressed && { opacity: 0.6 }]} accessibilityLabel={`Preset ${p.name}`}>
              <Text style={s.presetName} numberOfLines={1}>{p.name}</Text>
              {p.name !== p.formula && <Text style={s.presetFormula} numberOfLines={1}>{p.formula}</Text>}
            </Pressable>
          ))}
          <Pressable onPress={() => setEditing('new')} style={({ pressed }) => [s.preset, s.presetAdd, pressed && { opacity: 0.6 }]} accessibilityLabel="New preset">
            <Text style={s.presetAddText}>+</Text>
          </Pressable>
        </ScrollView>

      </View>
      {editing && (
        <PresetEditor
          preset={editing === 'new' ? null : editing}
          initialFormula={hand.length || modifier ? formatFormula(formulaFromHand(hand, modifier)) : ''}
          onClose={() => setEditing(null)}
        />
      )}
    </View>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    tray: { flex: 1, backgroundColor: c.tray, borderRadius: 20, overflow: 'hidden', marginHorizontal: 8 },
    resultBox: { height: 120, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 8, marginBottom: 6 },
    total: { fontSize: 48, lineHeight: 54, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
    formula: { fontSize: 13, color: c.secondaryLabel },
    breakdownScroll: { flexGrow: 0, alignSelf: 'stretch', marginTop: 6 },
    breakdown: { flexGrow: 1, justifyContent: 'center', gap: 6, paddingHorizontal: 16 },
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
    diceBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8 },
    presetBar: { flexGrow: 0, marginHorizontal: -12 },
    presets: { paddingHorizontal: 12, gap: 8, alignItems: 'center' },
    preset: { height: 36, paddingHorizontal: 12, borderRadius: 10, backgroundColor: c.fill, justifyContent: 'center', maxWidth: 160 },
    presetName: { fontSize: 14, fontWeight: '600', color: c.label },
    presetFormula: { fontSize: 11, color: c.secondaryLabel, fontVariant: ['tabular-nums'] },
    presetAdd: { width: 36, paddingHorizontal: 0, alignItems: 'center' },
    presetAddText: { fontSize: 22, color: c.accent, marginTop: -2 },
    dieBtn: { width: 50, height: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
    dieBtnOn: { backgroundColor: c.fill },
    dieLabel: { fontSize: 12, fontWeight: '500', color: c.label },
    badge: {
      position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9,
      backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
    },
    badgeText: { color: c.onAccent, fontSize: 11, fontWeight: '700' },
  });

interface Carry {
  start: (ax: number, ay: number, sides: DieSides) => void;
  move: (ax: number, ay: number) => void;
  end: () => void;
}

/**
 * One die on the bar. Tap adds it to the hand, hold removes one, and swiping up
 * carries hand + this die into the tray and throws on release: one motion to roll.
 */
function DieButton({ sides, count, onAdd, onRemove, carry, s, c }: {
  sides: DieSides; count: number; onAdd: () => void; onRemove: () => void; carry: Carry; s: ReturnType<typeof styles>; c: Palette;
}) {
  // Gesture hooks keep their first config; read the latest callbacks through a ref.
  const latest = useRef({ onAdd, onRemove, carry });
  useLayoutEffect(() => {
    latest.current = { onAdd, onRemove, carry };
  });
  const active = useRef(false);

  const pan = usePanGesture({
    runOnJS: true,
    minDistance: 10,
    onActivate: (e) => {
      active.current = true;
      latest.current.carry.start(e.absoluteX, e.absoluteY, sides);
    },
    onUpdate: (e) => active.current && latest.current.carry.move(e.absoluteX, e.absoluteY),
    onFinalize: () => {
      if (!active.current) return;
      active.current = false;
      latest.current.carry.end();
    },
  });
  const hold = useLongPressGesture({ runOnJS: true, minDuration: 450, onActivate: () => latest.current.onRemove() });
  const tap = useTapGesture({ runOnJS: true, onActivate: () => latest.current.onAdd() });
  const gesture = useExclusiveGestures(pan, hold, tap);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[s.dieBtn, count > 0 && s.dieBtnOn]} accessibilityRole="button" accessibilityLabel={`Add d${sides}`} accessibilityHint="Swipe up to roll it">
        <DieGlyph sides={sides} size={28} color={count > 0 ? c.accent : c.label} />
        <Text style={[s.dieLabel, count > 0 && { color: c.accent }]}>{sides === 100 ? 'd%' : `d${sides}`}</Text>
        {count > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{count}</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}
