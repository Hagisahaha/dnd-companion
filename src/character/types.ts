export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAME: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
export const ABILITY_SHORT: Record<Ability, string> = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

export interface ClassLevel {
  name: string;
  level: number;
  subclass: string | null; // subclass shortName
}

/** 0 = none, 1 = proficient, 2 = expertise */
export type ProfLevel = 0 | 1 | 2;

/** Numbers the player can pin by hand; any derived stat with a key here shows the override instead. */
export type OverrideKey =
  | 'ac' | 'initiative' | 'speed' | 'maxHp' | 'passivePerception' | 'spellDc' | 'spellAttack'
  | `save:${Ability}` | `skill:${string}` | `score:${Ability}`;

export interface Character {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;

  speciesId: string | null;
  backgroundId: string | null;
  /** First entry is the starting class (saves, level-1 HP). */
  classes: ClassLevel[];

  /** Scores before background and other bonuses (standard array / point buy / rolled). */
  baseScores: Record<Ability, number>;
  scoreMethod: 'standard' | 'pointbuy' | 'manual';
  /** 2024 background increase: +2/+1 or +1/+1/+1 among the background's three abilities. */
  backgroundBonus: Partial<Record<Ability, number>>;
  /** ASIs, feats, magic items. */
  otherBonus: Partial<Record<Ability, number>>;

  /** Keyed by lowercase skill name. */
  skills: Record<string, ProfLevel>;
  /** Extra save proficiencies (e.g. Resilient). Class saves are added automatically. */
  extraSaves: Ability[];

  armorId: string | null;
  shield: boolean;
  /** Flat AC from magic items, Defense fighting style, etc. */
  acBonus: number;
  /** Extra HP per level (e.g. Tough = 2). */
  hpPerLevelBonus: number;

  hp: { current: number; temp: number };
  deathSaves: { success: number; fail: number };
  hitDiceUsed: Record<number, number>;
  slotsUsed: number[]; // index 0 = level 1
  pactUsed: number;
  resourcesUsed: Record<string, number>;
  conditions: string[];
  exhaustion: number;
  concentration: string | null;

  /** Weapons carried. `bonus` is a magic +X to attack and damage. */
  weapons: { key: string; itemId: string; bonus: number }[];
  /** Spells known/in spellbook per class; `prepared` is what you can cast today (cantrips are always prepared). */
  spells: { id: string; className: string; prepared: boolean }[];

  overrides: Partial<Record<OverrideKey, number>>;
  notes: string;
}

export interface Part {
  label: string;
  value: number;
}

/** A derived number and how it was reached, so the sheet can always explain itself. */
export interface Stat {
  value: number;
  parts: Part[];
  overridden: boolean;
}
