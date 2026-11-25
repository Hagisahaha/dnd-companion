import type { Ability } from './types';

export interface FeatureRef {
  name: string;
  level: number;
  id: string | null;
}

export interface ClassRules {
  name: string;
  source: string;
  hitDie: number;
  saves: Ability[];
  primary: Ability[];
  armor: string[];
  weapons: string[];
  skillChoice: { from: string[] | 'any'; count: number } | null;
  caster: 'full' | 'half' | 'pact' | null;
  spellAbility: Ability | null;
  cantrips: number[] | null;
  prepared: number[] | null;
  /** [level-1][slotLevel-1] */
  slots: number[][] | null;
  pact: { slots: number[]; level: number[] } | null;
  table: { labels: string[]; cols: string[][] };
  features: FeatureRef[];
  subclassLevels: number[];
  asiLevels: number[];
  multiclass: { armor: string[]; weapons: string[] };
  alwaysPrepared: { level: number; ids: string[] }[];
  subclasses: { name: string; shortName: string; source: string; alwaysPrepared: { level: number; ids: string[] }[]; features: FeatureRef[] }[];
}

export interface SpeciesRules {
  id: string;
  name: string;
  source: string;
  size: string[];
  speed: number;
  darkvision: number | null;
}

export interface BackgroundRules {
  id: string;
  name: string;
  source: string;
  abilities: Ability[];
  skills: string[];
  feat: string | null;
}

export interface ArmorRules {
  id: string;
  name: string;
  kind: 'light' | 'medium' | 'heavy' | 'shield';
  ac: number;
  strength: number | null;
  stealthDisadvantage: boolean;
}

export interface WeaponRules {
  id: string;
  name: string;
  category: 'simple' | 'martial';
  ranged: boolean;
  damage: string;
  versatile: string | null;
  damageType: string;
  properties: string[];
  mastery: string | null;
  range: string | null;
}

interface RulesData {
  classes: ClassRules[];
  species: SpeciesRules[];
  backgrounds: BackgroundRules[];
  armor: ArmorRules[];
  weapons: WeaponRules[];
  skills: { name: string; ability: Ability }[];
}

export const RULES: RulesData = require('../data/rules.json');

export const getClass = (name: string) => RULES.classes.find((c) => c.name === name) ?? null;
export const getSpecies = (id: string | null) => (id ? RULES.species.find((s) => s.id === id) ?? null : null);
export const getBackground = (id: string | null) => (id ? RULES.backgrounds.find((b) => b.id === id) ?? null : null);
export const getArmor = (id: string | null) => (id ? RULES.armor.find((a) => a.id === id) ?? null : null);
export const SKILLS = RULES.skills;
export const getWeapon = (id: string) => RULES.weapons.find((w) => w.id === id) ?? null;

/** Value of a class table column at a class level, e.g. ("Rages", 5) -> "3". */
export function tableValue(cls: ClassRules, label: string, level: number): string | null {
  const i = cls.table.labels.indexOf(label);
  return i < 0 ? null : cls.table.cols[i][level - 1] ?? null;
}

/** 2024 multiclass spell slot table, indexed by caster level (same as the Wizard's). */
export const MULTICLASS_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0, 0, 0, 0], [4, 2, 0, 0, 0, 0, 0, 0, 0], [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0], [4, 3, 3, 0, 0, 0, 0, 0, 0], [4, 3, 3, 1, 0, 0, 0, 0, 0], [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0], [4, 3, 3, 3, 2, 0, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0], [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 0, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0], [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Subclasses that turn a non-caster into a one-third caster. */
export const THIRD_CASTERS: Record<string, { className: string; ability: Ability }> = {
  'Eldritch Knight': { className: 'Fighter', ability: 'int' },
  'Arcane Trickster': { className: 'Rogue', ability: 'int' },
};
