export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export const DIE_SIDES: readonly DieSides[] = [4, 6, 8, 10, 12, 20, 100];

export interface DiceTerm {
  count: number;
  sides: DieSides;
  /** -1 when the term is subtracted, e.g. "1d20 - 1d4". */
  sign: 1 | -1;
}

export interface DiceFormula {
  terms: DiceTerm[];
  modifier: number;
}

const TERM = /([+-]?)\s*(\d*)\s*(d\s*(?:\d+|%)|\d+)/gi;

/**
 * Parses notation like "2d8 + 1d6 + 4", "d20-1", "d%" into a formula.
 * Returns null for anything it does not fully understand, so callers never
 * roll a silently-misread formula.
 */
export function parseFormula(input: string): DiceFormula | null {
  const src = input.trim().toLowerCase();
  if (!src) return null;
  const terms: DiceTerm[] = [];
  let modifier = 0;
  let consumed = 0;
  let first = true;
  TERM.lastIndex = 0;
  for (let m = TERM.exec(src); m; m = TERM.exec(src)) {
    const gap = src.slice(consumed, m.index);
    if (gap.trim() !== '') return null;
    const signText = m[1];
    if (!first && !signText) return null;
    first = false;
    consumed = m.index + m[0].length;
    const sign: 1 | -1 = signText === '-' ? -1 : 1;
    const body = m[3].replace(/\s+/g, '');
    if (body.startsWith('d')) {
      const count = m[2] === '' ? 1 : Number(m[2]);
      const sidesText = body.slice(1);
      const sides = sidesText === '%' ? 100 : Number(sidesText);
      if (!DIE_SIDES.includes(sides as DieSides)) return null;
      if (count < 1 || count > 50) return null;
      terms.push({ count, sides: sides as DieSides, sign });
    } else {
      if (m[2] !== '') return null;
      modifier += sign * Number(body);
    }
  }
  if (src.slice(consumed).trim() !== '') return null;
  if (terms.length === 0 && consumed === 0) return null;
  return { terms, modifier };
}

export function formatFormula(f: DiceFormula): string {
  const parts: string[] = [];
  f.terms.forEach((t, i) => {
    const body = `${t.count}d${t.sides}`;
    if (i === 0) parts.push(t.sign < 0 ? `-${body}` : body);
    else parts.push(`${t.sign < 0 ? '-' : '+'} ${body}`);
  });
  if (f.modifier !== 0 || parts.length === 0) {
    const abs = Math.abs(f.modifier);
    if (parts.length === 0) parts.push(String(f.modifier));
    else parts.push(`${f.modifier < 0 ? '-' : '+'} ${abs}`);
  }
  return parts.join(' ');
}

/** Builds a formula from a hand of dice (sides list) and a flat modifier. */
export function formulaFromHand(hand: DieSides[], modifier: number): DiceFormula {
  const counts = new Map<DieSides, number>();
  for (const s of hand) counts.set(s, (counts.get(s) ?? 0) + 1);
  const terms = DIE_SIDES.filter((s) => counts.has(s))
    .sort((a, b) => b - a)
    .map((sides) => ({ count: counts.get(sides)!, sides, sign: 1 as const }));
  return { terms, modifier };
}
