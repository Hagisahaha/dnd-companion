import type { DiceFormula, DieSides } from './notation';

/** Returns a uniform integer in [1, sides]. */
export type Rng = (sides: number) => number;

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface RolledDie {
  id: string;
  sides: DieSides;
  value: number;
  sign: 1 | -1;
  /** Dropped by advantage/disadvantage; shown but not counted. */
  dropped: boolean;
  /** Times this die was rerolled individually (Lucky, GWF...). */
  rerolls: number;
}

export interface RollResult {
  id: string;
  formula: DiceFormula;
  mode: RollMode;
  dice: RolledDie[];
  total: number;
  /** Natural 20 / natural 1 on the kept d20 of a single-d20 roll. */
  crit: 'success' | 'fail' | null;
  at: number;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

/**
 * Secure, unbiased RNG. Uses crypto.getRandomValues (polyfilled by expo-crypto
 * on native) with rejection sampling so every face is exactly equally likely.
 */
export function createSecureRng(getRandomValues: (a: Uint32Array<ArrayBuffer>) => unknown): Rng {
  const buf = new Uint32Array(1);
  return (sides) => {
    const limit = Math.floor(0x100000000 / sides) * sides;
    for (;;) {
      getRandomValues(buf);
      if (buf[0] < limit) return (buf[0] % sides) + 1;
    }
  };
}

export function roll(formula: DiceFormula, mode: RollMode, rng: Rng): RollResult {
  const dice: RolledDie[] = [];
  for (const term of formula.terms) {
    for (let i = 0; i < term.count; i++) {
      dice.push({ id: nextId('d'), sides: term.sides, value: rng(term.sides), sign: term.sign, dropped: false, rerolls: 0 });
    }
  }
  // Advantage/disadvantage applies to the first d20: roll a twin, keep one.
  if (mode !== 'normal') {
    const idx = dice.findIndex((d) => d.sides === 20);
    if (idx >= 0) {
      const twin: RolledDie = { ...dice[idx], id: nextId('d'), value: rng(20) };
      dice.splice(idx + 1, 0, twin);
    }
  }
  return finalize({ id: nextId('r'), formula, mode, dice, total: 0, crit: null, at: Date.now() });
}

/** Rerolls one die in place (e.g. Lucky, Great Weapon Fighting). */
export function rerollDie(result: RollResult, dieId: string, rng: Rng): RollResult {
  const dice = result.dice.map((d) =>
    d.id === dieId ? { ...d, value: rng(d.sides), rerolls: d.rerolls + 1 } : d,
  );
  return finalize({ ...result, dice });
}

function finalize(r: RollResult): RollResult {
  const dice = r.dice.map((d) => ({ ...d, dropped: false }));
  if (r.mode !== 'normal') {
    const i = dice.findIndex((d) => d.sides === 20);
    if (i >= 0 && dice[i + 1]?.sides === 20) {
      const a = dice[i];
      const b = dice[i + 1];
      const keepFirst = r.mode === 'advantage' ? a.value >= b.value : a.value <= b.value;
      (keepFirst ? b : a).dropped = true;
    }
  }
  const total = dice.reduce((s, d) => (d.dropped ? s : s + d.sign * d.value), 0) + r.formula.modifier;
  const kept20 = dice.filter((d) => d.sides === 20 && !d.dropped);
  const crit = kept20.length === 1 && dice.filter((d) => !d.dropped).length >= 1
    ? kept20[0].value === 20 ? 'success' : kept20[0].value === 1 ? 'fail' : null
    : null;
  return { ...r, dice, total, crit };
}
