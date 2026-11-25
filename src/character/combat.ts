/**
 * Attacks and spells, built on top of `derive`. Pure functions, unit tested.
 */
import { getEntry } from '../compendium/store';
import { Derived, derive, signed } from './engine';
import { MULTICLASS_SLOTS, THIRD_CASTERS, WeaponRules, getClass, getWeapon, tableValue } from './rules';
import { ABILITY_SHORT, Ability, Character, Part, Stat } from './types';

const ABIL_FROM_NAME: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const sum = (parts: Part[]) => parts.reduce((s, p) => s + p.value, 0);
const mkStat = (parts: Part[]): Stat => ({ value: sum(parts), parts, overridden: false });

// ---------------------------------------------------------------------------
// Dice formula helpers
// ---------------------------------------------------------------------------

/** "8d6" + 2 × "1d6" -> "10d6"; mixed dice are joined. Flat numbers are summed. */
export function addDice(base: string, inc: string, times: number): string {
  const terms = new Map<number, number>();
  let flat = 0;
  const take = (f: string, k: number) => {
    for (const m of f.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?\d+)/g)) {
      if (m[3]) terms.set(Number(m[3]), (terms.get(Number(m[3])) ?? 0) + (m[1] === '-' ? -1 : 1) * Number(m[2] || 1) * k);
      else if (m[4]) flat += Number(m[4]) * k;
    }
  };
  take(base, 1);
  if (times > 0) take(inc, times);
  return withMod([...terms].filter(([, n]) => n > 0).sort((a, b) => b[0] - a[0]).map(([d, n]) => `${n}d${d}`).join('+'), flat);
}

export const withMod = (dice: string, mod: number) => (mod === 0 ? dice || '0' : dice ? `${dice}${mod > 0 ? '+' : ''}${mod}` : String(mod));

// ---------------------------------------------------------------------------
// Attacks
// ---------------------------------------------------------------------------

export interface Attack {
  key: string;
  name: string;
  itemId: string | null;
  toHit: Stat;
  damage: string;
  twoHanded: string | null;
  damageType: string;
  range: string;
  properties: string[];
  mastery: string | null;
  proficient: boolean;
  notes: string[];
}

function proficientWith(c: Character, w: WeaponRules): boolean {
  const lists = c.classes.map((cl, i) => {
    const k = getClass(cl.name);
    return (i === 0 ? k?.weapons : k?.multiclass.weapons) ?? [];
  });
  return lists.flat().some((p) => {
    const t = p.toLowerCase();
    if (t === 'simple') return w.category === 'simple';
    if (t === 'martial') return w.category === 'martial';
    if (t.startsWith('martial weapons that have')) {
      const okLight = t.includes('light') && w.properties.includes('light');
      const okFinesse = t.includes('finesse') && w.properties.includes('finesse');
      return w.category === 'martial' && (okLight || okFinesse);
    }
    return t.includes(w.name.toLowerCase());
  });
}

const dieSize = (f: string) => Number(/d(\d+)/.exec(f)?.[1] ?? 0);

export function attacks(c: Character, d: Derived = derive(c)): Attack[] {
  const monkLevel = c.classes.find((x) => x.name === 'Monk')?.level ?? 0;
  const monk = getClass('Monk');
  const martialArts = monkLevel && monk ? tableValue(monk, 'Martial Arts', monkLevel) : null;
  const barbarian = c.classes.find((x) => x.name === 'Barbarian');
  const rage = barbarian ? tableValue(getClass('Barbarian')!, 'Rage Damage', barbarian.level) : null;
  const hasMastery = d.features.some((f) => f.name === 'Weapon Mastery');
  const out: Attack[] = [];

  for (const wpn of c.weapons) {
    const w = getWeapon(wpn.itemId);
    if (!w) continue;
    const isMonkWeapon = monkLevel > 0 && !w.ranged && (w.category === 'simple' || w.properties.includes('light'));
    let ability: Ability = w.ranged ? 'dex' : 'str';
    if (!w.ranged && (w.properties.includes('finesse') || isMonkWeapon)) ability = d.mods.dex > d.mods.str ? 'dex' : 'str';
    const proficient = proficientWith(c, w);
    const parts: Part[] = [{ label: `${ABILITY_SHORT[ability]} modifier`, value: d.mods[ability] }];
    if (proficient) parts.push({ label: 'Proficiency', value: d.pb });
    if (wpn.bonus) parts.push({ label: 'Magic', value: wpn.bonus });
    let die = w.damage;
    const notes: string[] = [];
    if (isMonkWeapon && martialArts && dieSize(martialArts) > dieSize(die)) {
      die = martialArts;
      notes.push('Martial Arts die');
    }
    const dmgMod = d.mods[ability] + wpn.bonus;
    if (rage && ability === 'str') notes.push(`Raging: ${rage} damage`);
    if (!proficient) notes.push('Not proficient');
    out.push({
      key: wpn.key,
      name: wpn.bonus ? `${w.name} +${wpn.bonus}` : w.name,
      itemId: w.id,
      toHit: mkStat(parts),
      damage: withMod(die, dmgMod),
      twoHanded: w.versatile ? withMod(w.versatile, dmgMod) : null,
      damageType: w.damageType,
      range: w.range ? `${w.range} ft.` : w.properties.includes('reach') ? '10 ft.' : '5 ft.',
      properties: w.properties,
      mastery: hasMastery ? w.mastery : null,
      proficient,
      notes,
    });
  }

  // Unarmed Strike (2024): 1 + STR bludgeoning; monks use the Martial Arts die and may use DEX.
  const uAbility: Ability = monkLevel && d.mods.dex > d.mods.str ? 'dex' : 'str';
  out.push({
    key: 'unarmed',
    name: 'Unarmed Strike',
    itemId: null,
    toHit: mkStat([{ label: `${ABILITY_SHORT[uAbility]} modifier`, value: d.mods[uAbility] }, { label: 'Proficiency', value: d.pb }]),
    damage: martialArts ? withMod(martialArts, d.mods[uAbility]) : String(Math.max(0, 1 + d.mods.str)),
    twoHanded: null,
    damageType: 'bludgeoning',
    range: '5 ft.',
    properties: [],
    mastery: null,
    proficient: true,
    notes: rage && uAbility === 'str' ? [`Raging: ${rage} damage`] : [],
  });
  return out;
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export interface SpellEffect {
  label: string;
  formula: string;
  kind: 'damage' | 'healing';
}

export interface SpellView {
  id: string;
  name: string;
  level: number;
  className: string;
  prepared: boolean;
  school: string;
  time: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  attack: Stat | null;
  save: { ability: Ability; dc: number } | null;
  /** Dice for casting with a slot of `slotLevel` (ignored for cantrips, which scale by character level). */
  effects: (slotLevel: number) => SpellEffect[];
}

interface SpellData {
  level: number;
  school: string;
  concentration: boolean;
  ritual: boolean;
  classes: string[];
  attack: 'M' | 'R' | null;
  save: string | null;
  damage: string[] | null;
  heal: boolean;
  scaling: { label: string; scaling: Record<string, string> }[] | null;
  upcast: { base: string; from: number; inc: string } | null;
}

/** Highest spell level a class can cast at its level (for picking spells). */
export function maxSpellLevel(className: string, level: number, subclass: string | null): number {
  const k = getClass(className);
  if (!k) return 0;
  if (k.pact) return k.pact.level[level - 1] ?? 0;
  const row = k.slots?.[level - 1];
  const sub = k.subclasses.find((s) => s.shortName === subclass)?.name;
  const third = sub && THIRD_CASTERS[sub];
  const r = row ?? (third && level >= 3 ? MULTICLASS_SLOTS[Math.ceil(level / 3) - 1] : null);
  if (!r) return 0;
  let max = 0;
  r.forEach((n, i) => n > 0 && (max = i + 1));
  return max;
}

/** Which class's spell list a class picks from (Eldritch Knight and Arcane Trickster use the Wizard list). */
export function spellListFor(className: string, subclass: string | null): string | null {
  const k = getClass(className);
  if (!k) return null;
  if (k.spellAbility) return className;
  const sub = k.subclasses.find((s) => s.shortName === subclass)?.name;
  return sub && THIRD_CASTERS[sub] ? 'Wizard' : null;
}

export function spells(c: Character, d: Derived = derive(c)): SpellView[] {
  const out: SpellView[] = [];
  for (const pick of c.spells) {
    const e = getEntry(pick.id);
    if (!e) continue;
    const data = e.data as unknown as SpellData;
    const sc = d.spellcasting.find((x) => x.className === pick.className) ?? d.spellcasting[0];
    if (!sc) continue;
    const f = Object.fromEntries(e.fields ?? []);
    const text = JSON.stringify(e.entries);
    const addsMod = /plus your spellcasting ability modifier/i.test(text);
    const firstDice = /\{@(?:damage|dice) ([^}|]+)/.exec(text)?.[1]?.replace(/\s/g, '') ?? null;
    const kind: SpellEffect['kind'] = data.heal && !data.damage ? 'healing' : 'damage';
    const label = kind === 'healing' ? 'Healing' : `${(data.damage ?? [''])[0]} damage`.trim().replace(/^./, (m) => m.toUpperCase());
    const mod = addsMod ? d.mods[sc.ability] : 0;

    const effects = (slot: number): SpellEffect[] => {
      if (data.level === 0 && data.scaling) {
        const lvl = d.level;
        return data.scaling.map((s) => {
          const key = Object.keys(s.scaling).map(Number).filter((k) => k <= lvl).sort((a, b) => b - a)[0];
          return { label: s.label, formula: withMod(s.scaling[String(key)], mod), kind };
        });
      }
      if (data.upcast) {
        const extra = Math.max(0, slot - Math.max(data.level, data.upcast.from));
        return [{ label, formula: withMod(addDice(data.upcast.base, data.upcast.inc, extra), mod), kind }];
      }
      if (firstDice && (data.damage || data.heal)) return [{ label, formula: withMod(firstDice, mod), kind }];
      return [];
    };

    const saveAbility = data.save ? ABIL_FROM_NAME[data.save] : null;
    out.push({
      id: pick.id,
      name: e.name,
      level: data.level,
      className: pick.className,
      prepared: data.level === 0 || pick.prepared,
      school: data.school,
      time: f['Casting Time'] ?? '',
      range: f.Range ?? '',
      duration: f.Duration ?? '',
      concentration: data.concentration,
      ritual: data.ritual,
      attack: data.attack ? sc.attack : null,
      save: saveAbility ? { ability: saveAbility, dc: sc.dc.value } : null,
      effects,
    });
  }
  return out.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export type CastWith = { slot: number } | { pact: true } | { ritual: true } | { free: true };

/** Spends the slot (if any) and starts concentration when the spell needs it. */
export function castSpell(c: Character, spell: SpellView, how: CastWith): Character {
  let next = { ...c, updatedAt: Date.now() };
  if ('slot' in how) {
    const used = [...c.slotsUsed];
    used[how.slot - 1] = (used[how.slot - 1] ?? 0) + 1;
    next.slotsUsed = used;
  } else if ('pact' in how) next.pactUsed = c.pactUsed + 1;
  if (spell.concentration) next = { ...next, concentration: spell.name };
  return next;
}

/** Ways this spell can be cast right now, cheapest first. */
export function castOptions(spell: SpellView, d: Derived): { label: string; how: CastWith; level: number }[] {
  if (spell.level === 0) return [{ label: 'Cantrip', how: { free: true }, level: 0 }];
  const opts: { label: string; how: CastWith; level: number }[] = [];
  if (spell.ritual) opts.push({ label: 'Ritual', how: { ritual: true }, level: spell.level });
  for (const s of d.slots) if (s.level >= spell.level && s.used < s.max) opts.push({ label: `Level ${s.level}`, how: { slot: s.level }, level: s.level });
  if (d.pact && d.pact.level >= spell.level && d.pact.used < d.pact.max) opts.push({ label: `Pact (L${d.pact.level})`, how: { pact: true }, level: d.pact.level });
  return opts;
}

export const fmtHit = (s: Stat) => signed(s.value);
