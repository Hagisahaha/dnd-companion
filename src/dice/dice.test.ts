import { describe, expect, it } from 'vitest';
import { DieKind, faceNormal, getShape, readingFace } from './geometry';
import { formatFormula, formulaFromHand, parseFormula } from './notation';
import { percentileValue, toPhysical } from './physical';
import { createSecureRng, rerollDie, roll } from './roll';
import { simulateThrow } from './simulate';
import { rotateVec, symmetryMapping } from './symmetry';
import { webcrypto } from 'node:crypto';

const KINDS: DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd10p', 'd12', 'd20'];
const FACES: Record<DieKind, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d10p: 10, d12: 12, d20: 20 };

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('notation', () => {
  it.each([
    ['1d20+5', '1d20 + 5'],
    ['d20', '1d20'],
    ['2d8 + 1d6 + 4', '2d8 + 1d6 + 4'],
    ['8d6', '8d6'],
    ['1d20-1', '1d20 - 1'],
    ['d%', '1d100'],
    ['1d8 - 1d4', '1d8 - 1d4'],
  ])('parses %s', (src, out) => {
    const f = parseFormula(src);
    expect(f).not.toBeNull();
    expect(formatFormula(f!)).toBe(out);
  });

  it.each(['', 'abc', '1d7', '2d', '1d20 5', '1d20++', 'd20 x'])('rejects %j', (src) => {
    expect(parseFormula(src)).toBeNull();
  });

  it('builds a formula from a hand', () => {
    expect(formatFormula(formulaFromHand([6, 20, 6], 3))).toBe('1d20 + 2d6 + 3');
  });
});

describe('roll', () => {
  const rng = createSecureRng((a) => {
    webcrypto.getRandomValues(a as Uint32Array<ArrayBuffer>);
    return a;
  });

  it('is uniform over many rolls', () => {
    const counts = new Array(20).fill(0);
    const n = 200_000;
    for (let i = 0; i < n; i++) counts[rng(20) - 1]++;
    for (const c of counts) expect(Math.abs(c - n / 20)).toBeLessThan(n / 20 * 0.05);
  });

  it('keeps the higher d20 with advantage and the lower with disadvantage', () => {
    const seq = [7, 15, 3];
    const fixed = () => seq.shift()!;
    const r = roll(parseFormula('1d20+2')!, 'advantage', fixed);
    expect(r.dice.map((d) => [d.value, d.dropped])).toEqual([[7, true], [15, false]]);
    expect(r.total).toBe(17);
    const seq2 = [7, 15];
    const r2 = roll(parseFormula('1d20')!, 'disadvantage', () => seq2.shift()!);
    expect(r2.total).toBe(7);
  });

  it('flags natural 20 and natural 1', () => {
    expect(roll(parseFormula('1d20')!, 'normal', () => 20).crit).toBe('success');
    expect(roll(parseFormula('1d20')!, 'normal', () => 1).crit).toBe('fail');
    expect(roll(parseFormula('2d6')!, 'normal', () => 1).crit).toBeNull();
  });

  it('rerolls a single die and recomputes the total', () => {
    const r = roll(parseFormula('2d6+1')!, 'normal', () => 1);
    const r2 = rerollDie(r, r.dice[0].id, () => 6);
    expect(r2.total).toBe(8);
    expect(r2.dice[0].rerolls).toBe(1);
  });

  it('subtracts negative terms', () => {
    expect(roll(parseFormula('1d8-1d4')!, 'normal', () => 3).total).toBe(0);
  });
});

describe('geometry', () => {
  it.each(KINDS)('%s has the right faces and every value once', (kind) => {
    const s = getShape(kind);
    expect(s.faces.length).toBe(FACES[kind]);
    expect([...s.faceValue].sort((a, b) => a - b)).toEqual(Array.from({ length: FACES[kind] }, (_, i) => i + 1));
  });

  it.each(KINDS)('%s has a symmetry from every face to every face', (kind) => {
    const s = getShape(kind);
    for (let a = 0; a < s.faces.length; a++)
      for (let b = 0; b < s.faces.length; b++) {
        const q = symmetryMapping(s, a, b);
        const n = rotateVec(q, faceNormal(s, s.faces[a]));
        const m = faceNormal(s, s.faces[b]);
        expect(n[0] * m[0] + n[1] * m[1] + n[2] * m[2]).toBeCloseTo(1, 5);
      }
  });

  it('maps d100 values to a tens and units die and back', () => {
    for (let v = 1; v <= 100; v++) {
      const [tens, units] = toPhysical([{ id: 'x', sides: 100, value: v, sign: 1, dropped: false, rerolls: 0 }]);
      expect(percentileValue(tens.value, units.value)).toBe(v);
    }
  });
});

describe('simulateThrow', () => {
  it.each(KINDS)('%s always comes to rest showing the forced value', (kind) => {
    const n = FACES[kind];
    for (let value = 1; value <= n; value++) {
      const track = simulateThrow({
        dice: [{ kind, value, start: [0, 3, 4] }],
        velocity: [3, -25],
        bounds: [5, 8],
        random: seeded(value * 31 + n),
      });
      const shape = getShape(kind);
      const o = (track.frames - 1) * 4;
      const q = Array.from(track.quaternions[0].slice(o, o + 4)) as [number, number, number, number];
      const normals = shape.faces.map((f) => rotateVec(q, faceNormal(shape, f)));
      expect(shape.faceValue[readingFace(shape, normals)]).toBe(value);
    }
  });

  it('settles a full hand in under 4 seconds and stays in the tray', () => {
    const dice = KINDS.map((kind, i) => ({ kind, value: 1, start: [-3 + i, 3, 5] as [number, number, number] }));
    const track = simulateThrow({ dice, velocity: [0, -30], bounds: [5, 8], random: seeded(7) });
    expect(track.frames).toBeLessThan(240);
    track.positions.forEach((p) => {
      const o = (track.frames - 1) * 3;
      expect(Math.abs(p[o])).toBeLessThan(5);
      expect(Math.abs(p[o + 2])).toBeLessThan(8);
      expect(p[o + 1]).toBeLessThan(1.5);
    });
    expect(track.impacts.length).toBeGreaterThan(0);
  });
});

describe('kept dice as obstacles', () => {
  it('new dice still land on their values and never end up inside a kept die', () => {
    const obstacles = [
      { kind: 'd20' as const, pos: [0, 1, 0] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number] },
      { kind: 'd6' as const, pos: [1.5, 0.95, -2] as [number, number, number], quat: [0, 0, 0, 1] as [number, number, number, number] },
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const track = simulateThrow({
        dice: [{ kind: 'd8', value: (seed % 8) + 1, start: [0, 3, 5] }, { kind: 'd12', value: (seed % 12) + 1, start: [1, 3, 5] }],
        velocity: [0, -28],
        bounds: [4.5, 7.5],
        obstacles,
        random: seeded(seed),
      });
      track.positions.forEach((p, i) => {
        const o = (track.frames - 1) * 3;
        for (const ob of obstacles) {
          const dist = Math.hypot(p[o] - ob.pos[0], p[o + 1] - ob.pos[1], p[o + 2] - ob.pos[2]);
          expect(dist, `die ${i} vs ${ob.kind}`).toBeGreaterThan(1.2);
        }
        const kind = (['d8', 'd12'] as const)[i];
        const shape = getShape(kind);
        const q = Array.from(track.quaternions[i].slice((track.frames - 1) * 4, track.frames * 4)) as [number, number, number, number];
        const normals = shape.faces.map((f) => rotateVec(q, faceNormal(shape, f)));
        expect(shape.faceValue[readingFace(shape, normals)]).toBe(i === 0 ? (seed % 8) + 1 : (seed % 12) + 1);
      });
    }
  });
});
