/**
 * Pure 2024 rules engine: Character in, derived numbers out. Every number carries
 * the parts it was built from, and any of them can be pinned with an override.
 */
import {
  ClassRules, FeatureRef, MULTICLASS_SLOTS, SKILLS, THIRD_CASTERS, getArmor, getBackground, getClass, getSpecies, tableValue,
} from './rules';
import { ABILITIES, ABILITY_SHORT, Ability, Character, OverrideKey, Part, Stat } from './types';

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);

function stat(parts: Part[], c: Character, key?: OverrideKey): Stat {
  const value = parts.reduce((s, p) => s + p.value, 0);
  const o = key ? c.overrides[key] : undefined;
  return o === undefined ? { value, parts, overridden: false } : { value: o, parts: [...parts, { label: 'Override', value: o - value }], overridden: true };
}

export interface Resource {
  key: string;
  name: string;
  max: number;
  used: number;
  /** What a short rest restores: everything, a fixed number of uses, or nothing. */
  shortRest: 'all' | number | 'none';
  featureId: string | null;
}

export interface Spellcasting {
  className: string;
  ability: Ability;
  dc: Stat;
  attack: Stat;
  cantrips: number;
  prepared: number;
}

export interface Derived {
  level: number;
  pb: number;
  scores: Record<Ability, Stat>;
  mods: Record<Ability, number>;
  saves: Record<Ability, Stat & { proficient: boolean }>;
  skills: { name: string; key: string; ability: Ability; prof: number; fromBackground: boolean; stat: Stat }[];
  initiative: Stat;
  ac: Stat;
  speed: Stat;
  passivePerception: Stat;
  maxHp: Stat;
  hitDice: { faces: number; total: number; used: number }[];
  spellcasting: Spellcasting[];
  slots: { level: number; max: number; used: number }[];
  pact: { max: number; level: number; used: number } | null;
  resources: Resource[];
  features: (FeatureRef & { source: string })[];
  warnings: string[];
  summary: string;
}

const classesOf = (c: Character) =>
  c.classes.map((cl) => ({ cl, rules: getClass(cl.name) })).filter((x): x is { cl: typeof x.cl; rules: ClassRules } => !!x.rules);

export function derive(c: Character): Derived {
  const warnings: string[] = [];
  const cls = classesOf(c);
  const level = Math.max(1, cls.reduce((s, x) => s + x.cl.level, 0));
  const pb = 2 + Math.floor((level - 1) / 4);
  const levelOf = (name: string) => cls.find((x) => x.cl.name === name)?.cl.level ?? 0;
  const subOf = (name: string) => cls.find((x) => x.cl.name === name)?.cl.subclass ?? null;

  // ---- ability scores ----
  const scores = {} as Record<Ability, Stat>;
  const mods = {} as Record<Ability, number>;
  for (const a of ABILITIES) {
    const parts: Part[] = [{ label: 'Base', value: c.baseScores[a] }];
    if (c.backgroundBonus[a]) parts.push({ label: 'Background', value: c.backgroundBonus[a]! });
    if (c.otherBonus[a]) parts.push({ label: 'Other bonuses', value: c.otherBonus[a]! });
    scores[a] = stat(parts, c, `score:${a}`);
    mods[a] = mod(scores[a].value);
    if (scores[a].value > 20 && !scores[a].overridden) warnings.push(`${ABILITY_SHORT[a]} is above 20`);
  }

  // ---- saves ----
  const classSaves = new Set(cls[0]?.rules.saves ?? []);
  const saves = {} as Derived['saves'];
  for (const a of ABILITIES) {
    const proficient = classSaves.has(a) || c.extraSaves.includes(a);
    const parts: Part[] = [{ label: `${ABILITY_SHORT[a]} modifier`, value: mods[a] }];
    if (proficient) parts.push({ label: 'Proficiency', value: pb });
    saves[a] = { ...stat(parts, c, `save:${a}`), proficient };
  }

  // ---- skills ----
  const jack = levelOf('Bard') >= 2;
  const bgSkills = new Set(getBackground(c.backgroundId)?.skills ?? []);
  const skills = SKILLS.map((s) => {
    const key = s.name.toLowerCase();
    // Background skills are always proficient; the player can still raise them to expertise.
    const prof = Math.max(c.skills[key] ?? 0, bgSkills.has(key) ? 1 : 0);
    const parts: Part[] = [{ label: `${ABILITY_SHORT[s.ability]} modifier`, value: mods[s.ability] }];
    if (prof === 2) parts.push({ label: 'Expertise', value: pb * 2 });
    else if (prof === 1) parts.push({ label: 'Proficiency', value: pb });
    else if (jack) parts.push({ label: 'Jack of All Trades', value: Math.floor(pb / 2) });
    return { name: s.name, key, ability: s.ability, prof, fromBackground: bgSkills.has(key), stat: stat(parts, c, `skill:${key}`) };
  });

  const initParts: Part[] = [{ label: 'DEX modifier', value: mods.dex }];
  if (jack) initParts.push({ label: 'Jack of All Trades', value: Math.floor(pb / 2) });
  const initiative = stat(initParts, c, 'initiative');

  const perception = skills.find((s) => s.key === 'perception')!;
  const passivePerception = stat([{ label: 'Base', value: 10 }, { label: 'Perception', value: perception.stat.value }], c, 'passivePerception');

  // ---- armor class ----
  const armor = getArmor(c.armorId);
  const candidates: Part[][] = [];
  if (!armor) {
    candidates.push([{ label: 'Unarmored', value: 10 }, { label: 'DEX modifier', value: mods.dex }]);
    if (levelOf('Barbarian') >= 1)
      candidates.push([{ label: 'Unarmored Defense', value: 10 }, { label: 'DEX modifier', value: mods.dex }, { label: 'CON modifier', value: mods.con }]);
    if (levelOf('Monk') >= 1 && !c.shield)
      candidates.push([{ label: 'Unarmored Defense', value: 10 }, { label: 'DEX modifier', value: mods.dex }, { label: 'WIS modifier', value: mods.wis }]);
    if (levelOf('Sorcerer') >= 3 && subOf('Sorcerer') === 'Draconic')
      candidates.push([{ label: 'Draconic Resilience', value: 10 }, { label: 'DEX modifier', value: mods.dex }, { label: 'CHA modifier', value: mods.cha }]);
  } else if (armor.kind === 'light') candidates.push([{ label: armor.name, value: armor.ac }, { label: 'DEX modifier', value: mods.dex }]);
  else if (armor.kind === 'medium') candidates.push([{ label: armor.name, value: armor.ac }, { label: 'DEX modifier (max 2)', value: Math.min(mods.dex, 2) }]);
  else candidates.push([{ label: armor.name, value: armor.ac }]);
  const best = candidates.reduce((a, b) => (b.reduce((s, p) => s + p.value, 0) > a.reduce((s, p) => s + p.value, 0) ? b : a));
  const acParts = [...best];
  if (c.shield) acParts.push({ label: 'Shield', value: 2 });
  if (c.acBonus) acParts.push({ label: 'Other bonuses', value: c.acBonus });
  const ac = stat(acParts, c, 'ac');
  if (armor?.kind === 'heavy' && armor.strength && scores.str.value < armor.strength) warnings.push(`${armor.name} needs STR ${armor.strength}: speed −10 ft.`);

  // ---- speed ----
  const species = getSpecies(c.speciesId);
  const speedParts: Part[] = [{ label: species?.name ?? 'Base', value: species?.speed ?? 30 }];
  const monk = cls.find((x) => x.cl.name === 'Monk');
  if (monk && !armor && !c.shield) {
    const v = parseInt(tableValue(monk.rules, 'Unarmored Movement', monk.cl.level)?.replace('+', '') ?? '0', 10);
    if (v) speedParts.push({ label: 'Unarmored Movement', value: v });
  }
  if (levelOf('Barbarian') >= 5 && armor?.kind !== 'heavy') speedParts.push({ label: 'Fast Movement', value: 10 });
  if (armor?.kind === 'heavy' && armor.strength && scores.str.value < armor.strength) speedParts.push({ label: 'Heavy armor (STR too low)', value: -10 });
  const speed = stat(speedParts, c, 'speed');

  // ---- hit points ----
  const hpParts: Part[] = [];
  cls.forEach((x, i) => {
    const avg = x.rules.hitDie / 2 + 1;
    const first = i === 0 ? x.rules.hitDie : 0;
    const rest = (i === 0 ? x.cl.level - 1 : x.cl.level) * avg;
    hpParts.push({ label: `${x.cl.name} d${x.rules.hitDie}${i === 0 ? ' (max at level 1)' : ''}`, value: first + rest });
  });
  hpParts.push({ label: `CON modifier × ${level}`, value: mods.con * level });
  if (species?.name === 'Dwarf' && species.source === 'XPHB') hpParts.push({ label: 'Dwarven Toughness', value: level });
  if (c.hpPerLevelBonus) hpParts.push({ label: 'Other bonuses', value: c.hpPerLevelBonus * level });
  const maxHp = stat(hpParts, c, 'maxHp');

  const dice = new Map<number, number>();
  for (const x of cls) dice.set(x.rules.hitDie, (dice.get(x.rules.hitDie) ?? 0) + x.cl.level);
  const hitDice = [...dice].sort((a, b) => b[0] - a[0]).map(([faces, total]) => ({ faces, total, used: Math.min(total, c.hitDiceUsed[faces] ?? 0) }));

  // ---- spellcasting ----
  const spellcasting: Spellcasting[] = [];
  let casterLevel = 0;
  let casterClasses = 0;
  let singleSlots: number[] | null = null;
  for (const x of cls) {
    const third = x.cl.subclass && THIRD_CASTERS[subName(x.rules, x.cl.subclass)];
    const ability = x.rules.spellAbility ?? (third && x.cl.level >= 3 ? third.ability : null);
    if (!ability) continue;
    const dcParts: Part[] = [{ label: 'Base', value: 8 }, { label: 'Proficiency', value: pb }, { label: `${ABILITY_SHORT[ability]} modifier`, value: mods[ability] }];
    const atkParts: Part[] = [{ label: 'Proficiency', value: pb }, { label: `${ABILITY_SHORT[ability]} modifier`, value: mods[ability] }];
    spellcasting.push({
      className: x.cl.name,
      ability,
      dc: stat(dcParts, c, 'spellDc'),
      attack: stat(atkParts, c, 'spellAttack'),
      cantrips: x.rules.cantrips?.[x.cl.level - 1] ?? 0,
      prepared: x.rules.prepared?.[x.cl.level - 1] ?? 0,
    });
    if (x.rules.caster === 'full' || x.rules.caster === 'half') {
      casterClasses++;
      casterLevel += x.rules.caster === 'full' ? x.cl.level : Math.ceil(x.cl.level / 2);
      singleSlots = x.rules.slots?.[x.cl.level - 1] ?? null;
    } else if (third && x.cl.level >= 3) {
      casterClasses++;
      casterLevel += Math.floor(x.cl.level / 3);
      singleSlots = MULTICLASS_SLOTS[Math.ceil(x.cl.level / 3) - 1];
    }
  }
  const slotRow = casterClasses === 1 ? singleSlots : casterLevel > 0 ? MULTICLASS_SLOTS[Math.min(20, casterLevel) - 1] : null;
  const slots = (slotRow ?? []).map((max, i) => ({ level: i + 1, max, used: Math.min(max, c.slotsUsed[i] ?? 0) })).filter((s) => s.max > 0);
  const warlock = cls.find((x) => x.rules.pact);
  const pact = warlock
    ? { max: warlock.rules.pact!.slots[warlock.cl.level - 1], level: warlock.rules.pact!.level[warlock.cl.level - 1], used: Math.min(c.pactUsed, warlock.rules.pact!.slots[warlock.cl.level - 1]) }
    : null;

  // ---- limited-use features ----
  const resources: Resource[] = [];
  const feat = (cl: ClassRules, name: string) => cl.features.find((f) => f.name === name)?.id ?? null;
  const add = (key: string, name: string, max: number, shortRest: Resource['shortRest'], featureId: string | null) => {
    if (max > 0) resources.push({ key, name, max, used: Math.min(max, c.resourcesUsed[key] ?? 0), shortRest, featureId });
  };
  for (const { cl, rules } of cls) {
    const col = (label: string) => Number(tableValue(rules, label, cl.level)) || 0;
    switch (cl.name) {
      case 'Barbarian':
        add('rage', 'Rage', col('Rages'), 1, feat(rules, 'Rage'));
        break;
      case 'Bard':
        add('bardic', `Bardic Inspiration (${tableValue(rules, 'Bardic Die', cl.level)})`, Math.max(1, mods.cha), cl.level >= 5 ? 'all' : 'none', feat(rules, 'Bardic Inspiration'));
        break;
      case 'Cleric':
        add('channel', 'Channel Divinity', col('Channel Divinity'), 1, feat(rules, 'Channel Divinity'));
        break;
      case 'Druid':
        add('wildshape', 'Wild Shape', col('Wild Shape'), 1, feat(rules, 'Wild Shape'));
        break;
      case 'Fighter':
        add('secondwind', 'Second Wind', col('Second Wind'), 1, feat(rules, 'Second Wind'));
        add('actionsurge', 'Action Surge', cl.level >= 17 ? 2 : cl.level >= 2 ? 1 : 0, 'all', feat(rules, 'Action Surge'));
        break;
      case 'Monk':
        add('focus', 'Focus Points', col('Focus Points'), 'all', feat(rules, "Monk's Focus"));
        break;
      case 'Paladin':
        add('layonhands', 'Lay on Hands (HP pool)', cl.level * 5, 'none', feat(rules, 'Lay on Hands'));
        add('channel-paladin', 'Channel Divinity', col('Channel Divinity'), 1, feat(rules, 'Channel Divinity'));
        break;
      case 'Ranger':
        add('favored', "Favored Enemy (Hunter's Mark)", col('Favored Enemy'), 'none', feat(rules, 'Favored Enemy'));
        break;
      case 'Rogue':
        add('strokeofluck', 'Stroke of Luck', cl.level >= 20 ? 1 : 0, 'all', feat(rules, 'Stroke of Luck'));
        break;
      case 'Sorcerer':
        add('sorcery', 'Sorcery Points', col('Sorcery Points'), 'none', feat(rules, 'Font of Magic'));
        add('innate', 'Innate Sorcery', 2, 'none', feat(rules, 'Innate Sorcery'));
        break;
      case 'Warlock':
        add('cunning', 'Magical Cunning', cl.level >= 2 ? 1 : 0, 'none', feat(rules, 'Magical Cunning'));
        break;
      case 'Wizard':
        add('arcanerecovery', 'Arcane Recovery', 1, 'none', feat(rules, 'Arcane Recovery'));
        break;
    }
  }

  // ---- features gained so far ----
  const features: Derived['features'] = [];
  for (const { cl, rules } of cls) {
    for (const f of rules.features) if (f.level <= cl.level) features.push({ ...f, source: cl.name });
    const sc = rules.subclasses.find((s) => s.shortName === cl.subclass);
    if (sc) for (const f of sc.features) if (f.level <= cl.level) features.push({ ...f, source: `${cl.name} (${sc.name})` });
    if (!cl.subclass && rules.subclassLevels[0] && cl.level >= rules.subclassLevels[0]) warnings.push(`Choose a ${cl.name} subclass`);
  }
  features.sort((a, b) => a.level - b.level);

  if (!c.speciesId) warnings.push('No species chosen');
  if (!c.backgroundId) warnings.push('No background chosen');
  const bg = getBackground(c.backgroundId);
  if (bg) {
    const total = Object.values(c.backgroundBonus).reduce((s, v) => s + (v ?? 0), 0);
    if (total !== 3) warnings.push('Background ability increases should total +3');
  }

  const summary = cls.map((x) => `${x.cl.name} ${x.cl.level}`).join(' / ');
  return {
    level, pb, scores, mods, saves, skills, initiative, ac, speed, passivePerception, maxHp, hitDice,
    spellcasting, slots, pact, resources, features, warnings, summary,
  };
}

function subName(cls: ClassRules, short: string) {
  return cls.subclasses.find((s) => s.shortName === short)?.name ?? short;
}

// ---------------------------------------------------------------------------
// State changes. All pure: they return a new Character.
// ---------------------------------------------------------------------------

const touch = (c: Character, patch: Partial<Character>): Character => ({ ...c, ...patch, updatedAt: Date.now() });

export interface DamageOutcome {
  character: Character;
  /** CON save DC the player must make to keep concentration, if concentrating. */
  concentrationDc: number | null;
  instantDeath: boolean;
}

export function applyDamage(c: Character, amount: number): DamageOutcome {
  const d = derive(c);
  let left = Math.max(0, Math.floor(amount));
  const temp = Math.max(0, c.hp.temp - left);
  left -= c.hp.temp - temp;
  let deathSaves = c.deathSaves;
  let current = c.hp.current;
  let instantDeath = false;
  if (current === 0 && left > 0) {
    // Damage at 0 HP is a failed death save (2024 PHB); massive damage still kills outright.
    if (left >= d.maxHp.value) instantDeath = true;
    deathSaves = { ...deathSaves, fail: Math.min(3, deathSaves.fail + 1) };
  } else {
    const overflow = left - current;
    current = Math.max(0, current - left);
    if (current === 0 && overflow >= d.maxHp.value) instantDeath = true;
  }
  const concentrationDc = c.concentration && amount > 0 ? Math.min(30, Math.max(10, Math.floor(amount / 2))) : null;
  return { character: touch(c, { hp: { current, temp }, deathSaves }), concentrationDc, instantDeath };
}

export function applyHealing(c: Character, amount: number): Character {
  const max = derive(c).maxHp.value;
  const current = Math.min(max, c.hp.current + Math.max(0, Math.floor(amount)));
  return touch(c, { hp: { ...c.hp, current }, deathSaves: current > 0 ? { success: 0, fail: 0 } : c.deathSaves });
}

/** Temporary HP don't stack: keep the higher value. */
export function applyTempHp(c: Character, amount: number): Character {
  return touch(c, { hp: { ...c.hp, temp: Math.max(c.hp.temp, Math.floor(amount)) } });
}

export function shortRest(c: Character): Character {
  const d = derive(c);
  const used = { ...c.resourcesUsed };
  for (const r of d.resources) {
    if (r.shortRest === 'all') used[r.key] = 0;
    else if (typeof r.shortRest === 'number') used[r.key] = Math.max(0, (used[r.key] ?? 0) - r.shortRest);
  }
  return touch(c, { resourcesUsed: used, pactUsed: 0 });
}

export function longRest(c: Character): Character {
  const d = derive(c);
  return touch(c, {
    hp: { current: d.maxHp.value, temp: 0 },
    deathSaves: { success: 0, fail: 0 },
    hitDiceUsed: {},
    slotsUsed: [],
    pactUsed: 0,
    resourcesUsed: {},
    exhaustion: Math.max(0, c.exhaustion - 1),
  });
}

/** Fills fields added after a character was first saved, so old saves keep loading. */
export function migrate(c: Character): Character {
  return { ...newCharacter(c.id), ...c, weapons: c.weapons ?? [], spells: c.spells ?? [] };
}

export function newCharacter(id: string): Character {
  const now = Date.now();
  return {
    id, name: '', createdAt: now, updatedAt: now,
    speciesId: null, backgroundId: null, classes: [{ name: 'Fighter', level: 1, subclass: null }],
    baseScores: { str: 15, con: 14, dex: 13, wis: 12, cha: 10, int: 8 }, scoreMethod: 'standard',
    backgroundBonus: {}, otherBonus: {}, skills: {}, extraSaves: [],
    armorId: null, shield: false, acBonus: 0, hpPerLevelBonus: 0,
    hp: { current: 0, temp: 0 }, deathSaves: { success: 0, fail: 0 }, hitDiceUsed: {}, slotsUsed: [], pactUsed: 0,
    resourcesUsed: {}, conditions: [], exhaustion: 0, concentration: null, weapons: [], spells: [], overrides: {}, notes: '',
  };
}

/** 2024 point-buy costs. */
export const POINT_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

export const fmtMod = (n: number) => signed(n);
export { ABILITIES };
