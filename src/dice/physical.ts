import type { DieKind } from './geometry';
import type { RolledDie } from './roll';

export interface PhysicalDie {
  /** Id of the rolled die this physical die belongs to. */
  dieId: string;
  kind: DieKind;
  /** Face value the physical die must show (d10 "0" face is 10). */
  value: number;
}

const tenFace = (digit: number) => (digit === 0 ? 10 : digit);

/** Expands rolled dice into the physical dice thrown on the table (d100 = tens d10 + units d10). */
export function toPhysical(dice: RolledDie[]): PhysicalDie[] {
  return dice.flatMap((d): PhysicalDie[] => {
    if (d.sides === 100) {
      const tens = Math.floor((d.value % 100) / 10);
      const units = d.value % 10;
      return [
        { dieId: d.id, kind: 'd10p', value: tenFace(tens) },
        { dieId: d.id, kind: 'd10', value: tenFace(units) },
      ];
    }
    return [{ dieId: d.id, kind: `d${d.sides}` as DieKind, value: d.value }];
  });
}

/** Value printed on a physical d100 pair, back to 1..100. */
export function percentileValue(tensFace: number, unitsFace: number): number {
  const v = (tensFace % 10) * 10 + (unitsFace % 10);
  return v === 0 ? 100 : v;
}
