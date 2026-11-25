/**
 * Choices a class or species asks the player to make (invocations, fighting style,
 * weapon masteries, lineage…). Each spec says how many to pick and from what; the picks
 * live in `character.choices[spec.key]`, and engine/combat read them back.
 */
import { getIndex } from '../compendium/store';
import { getClass, getSpecies, RULES, tableValue } from './rules';
import type { Character } from './types';

export interface ChoiceOption {
  value: string;
  label: string;
  detail?: string;
  /** Compendium entry to read about the option. */
  entryId?: string;
  badge?: string;
}

export interface ChoiceSpec {
  key: string;
  title: string;
  /** Who grants it, e.g. "Warlock 5". */
  source: string;
  count: number;
  options: ChoiceOption[];
  /** What picking does in the app, if anything beyond listing it. */
  effect?: string;
}

const SKILL_NAMES = RULES.skills.map((s) => s.name);
const skillOptions = (names: string[]): ChoiceOption[] => names.map((n) => ({ value: n.toLowerCase(), label: n }));

/** Options from the compendium's optional features of a type, filtered by "<Class> Level N+" prerequisites. */
function optionalFeatures(type: string, className: string, level: number): ChoiceOption[] {
  return getIndex()
    .filter((e) => e.cat === 'optionalfeature' && ([] as string[]).concat(e.facets.type ?? []).includes(type))
    .filter((e) => {
      const m = new RegExp(`${className} Level (\\d+)\\+`).exec(e.subtitle);
      return !m || Number(m[1]) <= level;
    })
    .sort((a, b) => (a.source === 'XPHB' ? 0 : 1) - (b.source === 'XPHB' ? 0 : 1) || a.name.localeCompare(b.name))
    .map((e) => ({ value: e.id, label: e.name, entryId: e.id, badge: e.source, detail: e.subtitle.replace(/^[^(]*\(Prerequisite: /, 'Needs ').replace(/\)$/, '') || undefined }));
}

function fightingStyles(className: string): ChoiceOption[] {
  return getIndex()
    .filter((e) => e.cat === 'feat' && e.subtitle.startsWith('Fighting Style Feat'))
    .filter((e) => {
      const only = /\((Paladin|Ranger)\)/.exec(e.subtitle)?.[1];
      return !only || only === className;
    })
    .sort((a, b) => (a.source === 'XPHB' ? 0 : 1) - (b.source === 'XPHB' ? 0 : 1) || a.name.localeCompare(b.name))
    .map((e) => ({ value: e.id, label: e.name, entryId: e.id, badge: e.source }));
}

function masteryWeapons(className: string): ChoiceOption[] {
  return RULES.weapons
    .filter((w) => w.mastery)
    .filter((w) => {
      if (className === 'Barbarian') return !w.ranged; // 2024: Simple or Martial Melee weapons
      if (className === 'Rogue') return w.category === 'simple' || w.properties.includes('finesse') || w.properties.includes('light');
      return true;
    })
    .map((w) => ({ value: w.id, label: w.name, detail: `${w.mastery} · ${w.damage} ${w.damageType}`, entryId: w.id }));
}

const LINEAGES: Record<string, { title: string; options: string[] }> = {
  Elf: { title: 'Elven Lineage', options: ['Drow', 'High Elf', 'Wood Elf'] },
  Gnome: { title: 'Gnomish Lineage', options: ['Forest Gnome', 'Rock Gnome'] },
  Tiefling: { title: 'Fiendish Legacy', options: ['Abyssal', 'Chthonic', 'Infernal'] },
  Dragonborn: {
    title: 'Draconic Ancestry',
    options: ['Black (Acid)', 'Blue (Lightning)', 'Brass (Fire)', 'Bronze (Lightning)', 'Copper (Acid)', 'Gold (Fire)', 'Green (Poison)', 'Red (Fire)', 'Silver (Cold)', 'White (Cold)'],
  },
  Goliath: { title: 'Giant Ancestry', options: ["Cloud's Jaunt", "Fire's Burn", "Frost's Chill", "Hill's Tumble", "Stone's Endurance", "Storm's Thunder"] },
};

export function choiceSpecs(c: Character): ChoiceSpec[] {
  const out: ChoiceSpec[] = [];

  // ---- species (2024 PHB) ----
  const species = getSpecies(c.speciesId);
  if (species && species.source === 'XPHB') {
    const lin = LINEAGES[species.name];
    if (lin) out.push({ key: 'species:lineage', title: lin.title, source: species.name, count: 1, options: lin.options.map((o) => ({ value: o, label: o })) });
    if (species.name === 'Elf') out.push({ key: 'species:skills', title: 'Keen Senses', source: 'Elf', count: 1, options: skillOptions(['Insight', 'Perception', 'Survival']), effect: 'Skill proficiency' });
    if (species.name === 'Human') {
      out.push({ key: 'species:skills', title: 'Skillful', source: 'Human', count: 1, options: skillOptions(SKILL_NAMES), effect: 'Skill proficiency' });
      out.push({
        key: 'species:feat',
        title: 'Versatile (Origin Feat)',
        source: 'Human',
        count: 1,
        options: getIndex().filter((e) => e.cat === 'feat' && e.facets.category === 'Origin Feat').map((e) => ({ value: e.id, label: e.name, entryId: e.id, badge: e.source })),
        effect: 'Counts as a feat (Alert, Tough, Lucky… apply automatically)',
      });
    }
  }

  // ---- classes ----
  for (const cl of c.classes) {
    const k = getClass(cl.name);
    if (!k) continue;
    const lv = cl.level;
    const src = (n: number) => `${cl.name} ${n}`;
    const table = (label: string) => Number(tableValue(k, label, lv)) || 0;

    const styleAt = cl.name === 'Fighter' ? 1 : cl.name === 'Paladin' || cl.name === 'Ranger' ? 2 : 0;
    if (styleAt && lv >= styleAt) {
      out.push({ key: `${cl.name}:fighting-style`, title: 'Fighting Style', source: src(styleAt), count: 1, options: fightingStyles(cl.name), effect: 'Counts as a feat (Archery, Defense, Dueling apply automatically)' });
    }
    // Barbarian and Fighter have a Weapon Mastery column; Paladin, Ranger and Rogue master 2 weapons (2024 PHB).
    const hasMastery = k.features.some((f) => f.name === 'Weapon Mastery' && f.level <= lv);
    const masteries = hasMastery ? table('Weapon Mastery') || 2 : 0;
    if (masteries) {
      out.push({ key: `${cl.name}:mastery`, title: 'Weapon Mastery', source: src(1), count: masteries, options: masteryWeapons(cl.name), effect: 'Mastery shows on these weapons’ attacks' });
    }
    if (cl.name === 'Warlock') {
      const n = table('Invocations');
      if (n) out.push({ key: 'Warlock:invocations', title: 'Eldritch Invocations', source: src(lv), count: n, options: optionalFeatures('Eldritch Invocation', 'Warlock', lv) });
    }
    if (cl.name === 'Sorcerer' && lv >= 2) {
      out.push({ key: 'Sorcerer:metamagic', title: 'Metamagic', source: src(lv), count: lv >= 17 ? 6 : lv >= 10 ? 4 : 2, options: optionalFeatures('Metamagic', 'Sorcerer', lv) });
    }
    if (cl.name === 'Fighter' && cl.subclass === 'Battle Master' && lv >= 3) {
      out.push({ key: 'Fighter:maneuvers', title: 'Maneuvers', source: src(lv), count: lv >= 15 ? 9 : lv >= 10 ? 7 : lv >= 7 ? 5 : 3, options: optionalFeatures('Maneuver', 'Fighter', lv) });
    }
    if (cl.name === 'Cleric') {
      out.push({
        key: 'Cleric:divine-order', title: 'Divine Order', source: src(1), count: 1,
        options: [
          { value: 'Protector', label: 'Protector', detail: 'Martial weapons and Heavy armor' },
          { value: 'Thaumaturge', label: 'Thaumaturge', detail: 'One extra cantrip; WIS bonus to Arcana and Religion' },
        ],
        effect: 'Protector: martial weapon proficiency · Thaumaturge: +1 cantrip',
      });
    }
    if (cl.name === 'Druid') {
      out.push({
        key: 'Druid:primal-order', title: 'Primal Order', source: src(1), count: 1,
        options: [
          { value: 'Magician', label: 'Magician', detail: 'One extra cantrip; WIS bonus to Arcana and Nature' },
          { value: 'Warden', label: 'Warden', detail: 'Martial weapons and Medium armor' },
        ],
        effect: 'Warden: martial weapon proficiency · Magician: +1 cantrip',
      });
    }
  }
  return out;
}

export const picked = (c: Character, key: string): string[] => c.choices?.[key] ?? [];

/** Expertise the classes grant at the current levels (2024 PHB), to show a counter on skills. */
export function expertiseAllowed(c: Character): { count: number; sources: string[] } {
  let count = 0;
  const sources: string[] = [];
  for (const cl of c.classes) {
    const add = (n: number, label: string) => {
      count += n;
      sources.push(label);
    };
    if (cl.name === 'Rogue') {
      if (cl.level >= 1) add(2, 'Rogue 1');
      if (cl.level >= 6) add(2, 'Rogue 6');
    }
    if (cl.name === 'Bard') {
      if (cl.level >= 2) add(2, 'Bard 2');
      if (cl.level >= 9) add(2, 'Bard 9');
    }
    if (cl.name === 'Ranger') {
      if (cl.level >= 2) add(1, 'Ranger 2');
      if (cl.level >= 9) add(2, 'Ranger 9');
    }
    if (cl.name === 'Wizard' && cl.level >= 2) add(1, 'Wizard 2 (Scholar)');
  }
  return { count, sources };
}
