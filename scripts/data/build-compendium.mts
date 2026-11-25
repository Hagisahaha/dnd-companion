/**
 * Builds the in-app compendium from the raw 5etools data in data-raw/5etools.
 * Output: src/data/compendium/index.json (search index) and one detail file per category.
 *
 * Content policy (see docs/DESIGN.md):
 * - 2024 rules are the default, so any entry 5etools marks as `reprintedAs` (a newer
 *   printing exists) is dropped; the newer printing is kept.
 * - Unearthed Arcana, reskins (WoW), screens, recipes and crafting books are excluded.
 *
 * Run: npm run data:build
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXCLUDED_SOURCES, Json, RAW, isOfficial, keep, read, resolveCopies, sourceName, stripSrc, warnings } from './lib.mts';
const OUT = 'src/data/compendium';

// ---------- formatting helpers ----------
const SCHOOL: Record<string, string> = { A: 'Abjuration', C: 'Conjuration', D: 'Divination', E: 'Enchantment', V: 'Evocation', I: 'Illusion', N: 'Necromancy', T: 'Transmutation', P: 'Psionic' };
const SIZE: Record<string, string> = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan', V: 'Varies' };
const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const DMG: Record<string, string> = { A: 'acid', B: 'bludgeoning', C: 'cold', F: 'fire', O: 'force', L: 'lightning', N: 'necrotic', P: 'piercing', I: 'poison', Y: 'psychic', R: 'radiant', S: 'slashing', T: 'thunder' };
const ITEM_TYPE: Record<string, string> = {
  A: 'Ammunition', AF: 'Ammunition', AT: "Artisan's Tools", EM: 'Eldritch Machine', EXP: 'Explosive', FD: 'Food and Drink', G: 'Adventuring Gear',
  GS: 'Gaming Set', HA: 'Heavy Armor', INS: 'Instrument', LA: 'Light Armor', M: 'Melee Weapon', MA: 'Medium Armor', MNT: 'Mount', MR: 'Master Rune',
  GV: 'Generic Variant', P: 'Potion', R: 'Ranged Weapon', RD: 'Rod', RG: 'Ring', S: 'Shield', SC: 'Scroll', SCF: 'Spellcasting Focus', OTH: 'Other',
  T: 'Tools', TAH: 'Tack and Harness', TG: 'Trade Good', $: 'Treasure', $A: 'Art Object', $C: 'Coinage', $G: 'Gemstone', VEH: 'Vehicle (land)', SHP: 'Vehicle (water)',
  AIR: 'Vehicle (air)', SPC: 'Vehicle (space)', WD: 'Wand', IDG: 'Illegal Drug',
};
const PROPERTY: Record<string, string> = {
  A: 'Ammunition', AF: 'Ammunition', BF: 'Burst Fire', F: 'Finesse', H: 'Heavy', L: 'Light', LD: 'Loading', R: 'Reach', RLD: 'Reload',
  S: 'Special', T: 'Thrown', '2H': 'Two-Handed', V: 'Versatile',
};
const FEAT_CAT: Record<string, string> = { O: 'Origin Feat', G: 'General Feat', FS: 'Fighting Style Feat', 'FS:P': 'Fighting Style Feat (Paladin)', 'FS:R': 'Fighting Style Feat (Ranger)', EB: 'Epic Boon Feat', D: 'Dragonmark Feat' };
const OPT_TYPE: Record<string, string> = {
  EI: 'Eldritch Invocation', MM: 'Metamagic', 'MV:B': 'Maneuver', 'FS:F': 'Fighting Style (Fighter)', 'FS:R': 'Fighting Style (Ranger)', 'FS:P': 'Fighting Style (Paladin)',
  'FS:B': 'Fighting Style (Bard)', AI: 'Artificer Infusion', PB: 'Pact Boon', AS: 'Arcane Shot', 'AS:V1-UA': 'Arcane Shot', ED: 'Elemental Discipline',
  RN: 'Rune Knight Rune', AF: 'Alchemical Formula', OR: 'Onomancy Resonant', TT: "Traveler's Trick", 'MV:C2-UA': 'Maneuver', 'MV': 'Maneuver',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ordinal = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const join_ = (a: string[], last = 'or') => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} ${last} ${a[a.length - 1]}`);

function fmtTime(t: Json): string {
  return (t ?? []).map((x: Json) => {
    const unit = x.unit === 'bonus' ? 'Bonus Action' : cap(x.unit);
    const base = x.number === 1 && ['action', 'bonus', 'reaction'].includes(x.unit) ? unit : `${x.number} ${unit}${x.number > 1 ? 's' : ''}`;
    return x.condition ? `${base}, ${x.condition}` : base;
  }).join(' or ');
}

function fmtDist(d: Json): string {
  if (!d) return '';
  if (['self', 'touch', 'sight', 'unlimited'].includes(d.type)) return cap(d.type);
  return `${d.amount} ${d.amount === 1 ? d.type.replace(/s$/, '') : d.type}`;
}

function fmtRange(r: Json): string {
  if (!r) return '';
  if (r.type === 'special') return 'Special';
  if (r.type === 'point') return fmtDist(r.distance);
  const unit = r.distance?.type === 'miles' ? 'mile' : 'foot';
  const shape = r.type === 'radius' ? 'radius' : r.type === 'sphere' ? 'sphere' : r.type;
  return `Self (${r.distance?.amount}-${unit} ${shape})`;
}

function fmtComponents(c: Json): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.v) parts.push('V');
  if (c.s) parts.push('S');
  if (c.m) parts.push(`M (${typeof c.m === 'string' ? c.m : c.m.text})`);
  if (c.r) parts.push('R');
  return parts.join(', ');
}

function fmtDuration(ds: Json): string {
  return (ds ?? []).map((d: Json) => {
    if (d.type === 'instant') return 'Instantaneous';
    if (d.type === 'special') return 'Special';
    if (d.type === 'permanent') return d.ends ? `Until ${join_(d.ends.map((e: string) => (e === 'dispel' ? 'dispelled' : e === 'trigger' ? 'triggered' : e)))}` : 'Permanent';
    if (d.type === 'timed') {
      const a = d.duration.amount;
      const u = `${a} ${d.duration.type}${a > 1 ? 's' : ''}`;
      return d.concentration ? `Concentration, up to ${u}` : u;
    }
    return d.type;
  }).join(' or ');
}

function fmtSpeed(s: Json): string {
  if (typeof s === 'number') return `${s} ft.`;
  if (!s) return '';
  return Object.entries(s)
    .filter(([k]) => k !== 'canHover')
    .map(([k, v]: [string, Json]) => {
      const n = typeof v === 'object' ? v.number : v === true ? 'equal to walking' : v;
      return k === 'walk' ? `${n} ft.` : `${k} ${n}${typeof n === 'number' ? ' ft.' : ''}`;
    })
    .join(', ');
}

function fmtPrereq(p: Json[] | undefined): string | undefined {
  if (!p?.length) return undefined;
  const one = (r: Json): string => {
    const out: string[] = [];
    if (r.level) out.push(typeof r.level === 'number' ? `Level ${r.level}+` : `${r.level.class?.name ?? ''} Level ${r.level.level}+`.trim());
    if (r.ability) out.push(join_(r.ability.map((a: Json) => Object.entries(a).map(([k, v]) => `${ABIL[k] ?? k} ${v}+`).join(' and '))));
    if (r.race) out.push(join_(r.race.map((x: Json) => cap(x.displayEntry ?? x.name) + (x.subrace ? ` (${x.subrace})` : ''))));
    if (r.feat) out.push(join_(r.feat.map((x: string) => cap(stripSrc(x).replace(/;.*/, '')))) + ' Feat');
    if (r.background) out.push(join_(r.background.map((x: Json) => cap(x.name))) + ' Background');
    if (r.spellcasting || r.spellcasting2020 || r.spellcastingFeature) out.push('Spellcasting or Pact Magic Feature');
    if (r.spellcastingPrepared) out.push('Ability to prepare spells');
    if (r.proficiency) out.push(r.proficiency.map((x: Json) => Object.entries(x).map(([k, v]) => `${cap(String(v))} ${k === 'armor' ? 'Armor' : k === 'weapon' ? 'Weapon' : k} Proficiency`).join(', ')).join(' or '));
    if (r.spell) out.push(join_(r.spell.map((x: Json) => cap(stripSrc(typeof x === 'string' ? x : x.entry ?? '').replace(/#c$/, ' cantrip')))));
    if (r.pact) out.push(`Pact of the ${r.pact}`);
    if (r.patron) out.push(`${r.patron} Patron`);
    if (r.optionalfeature) out.push(join_(r.optionalfeature.map((x: string) => cap(stripSrc(x)))));
    if (r.otherSummary) out.push(r.otherSummary.entrySummary ?? r.otherSummary.entry);
    if (r.other) out.push(r.other);
    if (r.campaign) out.push(`${join_(r.campaign)} Campaign`);
    return out.join(', ');
  };
  return p.map(one).filter(Boolean).join('; or ') || undefined;
}

function fmtAbilityChoice(ab: Json[] | undefined): string | undefined {
  if (!ab?.length) return undefined;
  const a = ab[0];
  const from = a.choose?.weighted?.from ?? a.choose?.from;
  if (from) return from.map((k: string) => ABIL[k] ?? k).join(', ');
  return Object.entries(a).filter(([k]) => ABIL[k]).map(([k, v]) => `${ABIL[k]} +${v}`).join(', ') || undefined;
}

const SMALL = new Set(['of', 'the', 'and', 'or', 'a', 'an', 'in', 'on', 'to', 'for']);
const titleCase = (s: string) =>
  s.split(' ').map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
/** {"magic initiate; cleric|xphb": true} -> "Magic Initiate (Cleric)" */
const keysTrue = (arr: Json[] | undefined) =>
  (arr ?? []).flatMap((o: Json) =>
    Object.entries(o)
      .filter(([, v]) => v === true)
      .map(([k]) => {
        const [name, variant] = stripSrc(k).split(';').map((x) => x.trim());
        return titleCase(name) + (variant ? ` (${titleCase(variant)})` : '');
      }),
  );

// ---------- output model ----------
interface Out {
  id: string;
  name: string;
  source: string;
  page?: number;
  subtitle: string;
  fields?: [string, string][];
  entries: Json[];
  /** Structured data for filters and the rules engine. */
  data?: Record<string, Json>;
}

const outputs = new Map<string, Out[]>();
const idOf = (cat: string, name: string, source: string) => `${cat}:${name}|${source}`.toLowerCase();
function emit(cat: string, o: Omit<Out, 'id' | 'fields'> & { idName?: string; fields?: [string, string | undefined][] }) {
  const { idName, ...rest } = o;
  const fields = rest.fields?.filter(([, v]) => v !== undefined && v !== '') as [string, string][] | undefined;
  const list = outputs.get(cat) ?? [];
  list.push({ id: idOf(cat, idName ?? rest.name, rest.source), ...rest, fields: fields?.length ? fields : undefined });
  outputs.set(cat, list);
}


// ---------- spells ----------
const spellClasses: Json = read('spells/sources.json');
const spellIndex: Record<string, string> = read('spells/index.json');
for (const file of Object.values(spellIndex)) {
  for (const s of resolveCopies(read(`spells/${file}`).spell ?? [])) {
    if (!keep(s)) continue;
    const classes = (spellClasses[s.source]?.[s.name]?.class ?? [])
      .filter((c: Json) => isOfficial(c.source) && !EXCLUDED_SOURCES.has(c.definedInSource))
      .map((c: Json) => c.name);
    const school = SCHOOL[s.meta?.school ?? s.school] ?? s.school;
    const concentration = (s.duration ?? []).some((d: Json) => d.concentration);
    const ritual = !!s.meta?.ritual;
    emit('spell', {
      name: s.name, source: s.source, page: s.page,
      subtitle: s.level === 0 ? `${school} Cantrip` : `Level ${s.level} ${school}`,
      fields: [
        ['Casting Time', fmtTime(s.time) + (ritual ? ' or Ritual' : '')],
        ['Range', fmtRange(s.range)],
        ['Components', fmtComponents(s.components)],
        ['Duration', fmtDuration(s.duration)],
        ['Classes', [...new Set<string>(classes)].sort().join(', ')],
      ],
      entries: [...(s.entries ?? []), ...(s.entriesHigherLevel ?? [])],
      data: {
        level: s.level, school, concentration, ritual, classes: [...new Set(classes)],
        attack: s.spellAttack?.[0] ?? null, // 'M' | 'R'
        save: s.savingThrow?.[0] ?? null, // 'dexterity' ...
        damage: s.damageInflict ?? null,
        heal: (s.miscTags ?? []).includes('HL'),
        // Cantrip dice by character level, e.g. [{ label, scaling: { 1: '1d10', 5: '2d10' } }]
        scaling: s.scalingLevelDice ? [].concat(s.scalingLevelDice) : null,
        // Upcasting from "{@scaledamage 8d6|3-9|1d6}": base dice, plus `inc` per slot level above `from`.
        upcast: (() => {
          const m = /\{@scale(?:damage|dice) ([^|}]+)\|(\d+)-\d+\|([^|}]+)/.exec(JSON.stringify(s.entriesHigherLevel ?? []));
          return m ? { base: m[1].replace(/\s/g, ''), from: Number(m[2]), inc: m[3].replace(/\s/g, '') } : null;
        })(),
      },
    });
  }
}

// ---------- items ----------
const itemsRaw = resolveCopies([...read('items-base.json').baseitem, ...read('items.json').item, ...read('items.json').itemGroup.map((g: Json) => ({ ...g, _group: true }))]);
for (const it of [...itemsRaw, ...resolveCopies(read('magicvariants.json').magicvariant)]) {
  if (!keep(it)) continue;
  const type = it.type ? ITEM_TYPE[stripSrc(it.type)] ?? stripSrc(it.type) : it.wondrous ? 'Wondrous Item' : it.staff ? 'Staff' : it._group ? 'Item Group' : 'Item';
  const kind = it.wondrous && it.type ? `Wondrous Item, ${type}` : it.wondrous ? 'Wondrous Item' : type;
  const rarity = it.rarity && !['none', 'unknown', 'unknown (magic)'].includes(it.rarity) ? it.rarity : it.inherits?.rarity && it.inherits.rarity !== 'varies' ? it.inherits.rarity : undefined;
  const attune = it.reqAttune ?? it.inherits?.reqAttune;
  const attuneText = attune === true ? 'requires attunement' : typeof attune === 'string' ? `requires attunement ${attune}` : '';
  const dmg = it.dmg1 ? `${it.dmg1} ${DMG[it.dmgType] ?? ''}`.trim() + (it.dmg2 ? ` (${it.dmg2} versatile)` : '') : undefined;
  const props = (it.property ?? []).map((p: Json) => PROPERTY[stripSrc(typeof p === 'string' ? p : p.uid)] ?? stripSrc(typeof p === 'string' ? p : p.uid));
  const range = it.range ? `${it.range} ft.` : undefined;
  emit('item', {
    name: it.name, source: it.source, page: it.page,
    subtitle: [kind, rarity, attuneText ? `(${attuneText})` : ''].filter(Boolean).join(', ').replace(', (', ' ('),
    fields: [
      ['Damage', dmg],
      ['Armor Class', it.ac !== undefined ? `${it.ac}${stripSrc(it.type ?? '') === 'LA' ? ' + Dex' : stripSrc(it.type ?? '') === 'MA' ? ' + Dex (max 2)' : stripSrc(it.type ?? '') === 'S' ? ' (bonus)' : ''}` : undefined],
      ['Properties', props.length ? props.join(', ') + (range ? ` (${range})` : '') : undefined],
      ['Mastery', it.mastery?.map((m: string) => stripSrc(m)).join(', ')],
      ['Strength', it.strength ? `Str ${it.strength}` : undefined],
      ['Stealth', it.stealth ? 'Disadvantage' : undefined],
      ['Weight', it.weight ? `${it.weight} lb.` : undefined],
      ['Cost', it.value ? (it.value >= 100 ? `${it.value / 100} gp` : it.value >= 10 ? `${it.value / 10} sp` : `${it.value} cp`) : undefined],
    ],
    entries: [...(it.entries ?? []), ...(it.items ? [{ type: 'list', items: it.items.map((x: string) => `{@item ${x}}`) }] : [])],
    data: { rarity, attunement: !!attune, magic: !!rarity && rarity !== 'none', type: it.wondrous ? 'Wondrous Item' : type },
  });
}

// ---------- feats, backgrounds, species ----------
for (const f of resolveCopies(read('feats.json').feat)) {
  if (!keep(f)) continue;
  const prereq = fmtPrereq(f.prerequisite);
  emit('feat', {
    name: f.name, source: f.source, page: f.page,
    subtitle: `${FEAT_CAT[f.category] ?? 'Feat'}${prereq ? ` (Prerequisite: ${prereq})` : ''}`,
    fields: [['Repeatable', f.repeatable ? 'Yes' : undefined]],
    entries: f.entries ?? [],
    data: { category: f.category },
  });
}

for (const b of resolveCopies(read('backgrounds.json').background)) {
  if (!keep(b)) continue;
  emit('background', {
    name: b.name, source: b.source, page: b.page, subtitle: 'Background',
    fields: [
      ['Ability Scores', fmtAbilityChoice(b.ability)],
      ['Feat', keysTrue(b.feats).join(', ')],
      ['Skills', keysTrue(b.skillProficiencies).join(', ')],
      ['Tools', keysTrue(b.toolProficiencies).join(', ')],
    ],
    entries: b.entries ?? [],
  });
}

const racesFile = read('races.json');
const races = resolveCopies(racesFile.race);
for (const r of races) {
  if (!keep(r)) continue;
  emit('species', {
    name: r.name, source: r.source, page: r.page, subtitle: r.source === 'XPHB' ? 'Species' : 'Species (legacy race format)',
    fields: [
      ['Creature Type', (r.creatureTypes ?? ['humanoid']).map(cap).join(', ')],
      ['Size', (r.size ?? []).map((s: string) => SIZE[s] ?? s).join(' or ')],
      ['Speed', fmtSpeed(r.speed)],
      ['Ability Scores', r.ability ? fmtAbilityChoice(r.ability) : undefined],
    ],
    entries: r.entries ?? [],
  });
}
for (const sr of racesFile.subrace) {
  const parent = races.find((r: Json) => r.name === sr.raceName && r.source === sr.raceSource);
  if (!parent || !keep(parent) || !sr.name || sr.reprintedAs) continue;
  const source = sr.source ?? parent.source;
  if (!isOfficial(source)) continue;
  emit('species', {
    name: `${parent.name} (${sr.name})`, source, page: sr.page ?? parent.page, subtitle: `Subrace of ${parent.name}`,
    fields: [
      ['Ability Scores', sr.ability ? fmtAbilityChoice(sr.ability) : undefined],
      ['Speed', sr.speed ? fmtSpeed(sr.speed) : undefined],
    ],
    entries: sr.entries ?? [],
  });
}

// ---------- rules, conditions, actions, optional features ----------
const cd = read('conditionsdiseases.json');
for (const c of cd.condition) if (keep(c)) emit('condition', { name: c.name, source: c.source, page: c.page, subtitle: 'Condition', entries: c.entries });
for (const c of cd.disease) if (keep(c)) emit('condition', { name: c.name, source: c.source, page: c.page, subtitle: 'Disease', entries: c.entries });
for (const c of cd.status ?? []) if (keep(c)) emit('condition', { name: c.name, source: c.source, page: c.page, subtitle: 'Status', entries: c.entries });
for (const a of read('actions.json').action) if (keep(a)) emit('action', { name: a.name, source: a.source, page: a.page, subtitle: 'Action', fields: [['Time', a.time ? fmtTime(a.time.filter((t: Json) => typeof t === 'object')) : undefined]], entries: a.entries });
for (const v of read('variantrules.json').variantrule) {
  if (!keep(v)) continue;
  const rt: Record<string, string> = { C: 'Core Rule', O: 'Optional Rule', V: 'Variant Rule', VO: 'Variant Optional Rule', VV: 'Variant Rule', U: 'Rule' };
  emit('rule', { name: v.name, source: v.source, page: v.page, subtitle: rt[v.ruleType] ?? 'Rule', entries: v.entries });
}
for (const o of resolveCopies(read('optionalfeatures.json').optionalfeature)) {
  if (!keep(o)) continue;
  const prereq = fmtPrereq(o.prerequisite);
  emit('optionalfeature', {
    name: o.name, source: o.source, page: o.page,
    subtitle: `${(o.featureType ?? []).map((t: string) => OPT_TYPE[t] ?? t).join(', ')}${prereq ? ` (Prerequisite: ${prereq})` : ''}`,
    entries: o.entries ?? [],
    data: { featureType: o.featureType },
  });
}

// ---------- class & subclass features ----------
const classFiles = readdirSync(join(RAW, 'class')).filter((f) => f.startsWith('class-'));
const classes: Json[] = [];
const subclasses: Json[] = [];
const classFeatures: Json[] = [];
const subclassFeatures: Json[] = [];
for (const f of classFiles) {
  const d = read(`class/${f}`);
  classes.push(...(d.class ?? []));
  subclasses.push(...(d.subclass ?? []));
  classFeatures.push(...(d.classFeature ?? []));
  subclassFeatures.push(...(d.subclassFeature ?? []));
}
const legacyClass = new Set(classes.filter((c) => c.reprintedAs || c.reskinOf || !isOfficial(c.source)).map((c) => `${c.name}|${c.source}`));
const subKey = (className: string, classSource: string, short: string, source: string) => `${className}|${classSource}|${short}|${source}`;
const subclassOk = new Map<string, Json>();
const subclassOfFeature = new Map<string, Json>();
for (const sc of resolveCopies(subclasses)) {
  const ok = keep(sc) && !legacyClass.has(`${sc.className}|${sc.classSource}`) && isOfficial(sc.source);
  // A subclass printed for the 2014 class but re-attached to the 2024 class reuses the 2014 feature records.
  if (ok) {
    for (const ref of sc.subclassFeatures ?? []) {
      const r = typeof ref === 'string' ? ref : ref.subclassFeature;
      const [, className, classSource, short, source] = r.split('|');
      subclassOk.set(subKey(className, classSource || 'PHB', short, source || 'PHB'), sc);
    }
    subclassOfFeature.set(subKey(sc.className, sc.classSource, sc.shortName, sc.source), sc);
  }
}
for (const cf of classFeatures) {
  if (legacyClass.has(`${cf.className}|${cf.classSource}`) || !isOfficial(cf.source)) continue;
  emit('classfeature', {
    name: cf.name, idName: `${cf.name}|${cf.className}|${cf.level}`, source: cf.source, page: cf.page,
    subtitle: `${cf.className} ${cf.level}`,
    entries: cf.entries ?? [],
    data: { className: cf.className, level: cf.level },
  });
}
for (const sf of resolveCopies(subclassFeatures)) {
  const k = subKey(sf.className, sf.classSource, sf.subclassShortName, sf.subclassSource);
  const sc = subclassOk.get(k) ?? subclassOfFeature.get(k);
  if (!sc || !isOfficial(sf.source)) continue;
  emit('subclassfeature', {
    name: sf.name, idName: `${sf.name}|${sf.className}|${sf.subclassShortName}|${sf.level}`, source: sf.source, page: sf.page,
    subtitle: `${sf.className} (${sc.name}) ${sf.level}`,
    entries: sf.entries ?? [],
    data: { className: sf.className, subclass: sc.name, level: sf.level },
  });
}

// ---------- filter facets ----------
const CORE_2024 = new Set(['XPHB', 'XDMG', 'XMM']);
const ITEM_GROUP: Record<string, string> = {
  'Melee Weapon': 'Weapon', 'Ranged Weapon': 'Weapon', 'Light Armor': 'Armor', 'Medium Armor': 'Armor', 'Heavy Armor': 'Armor',
  Shield: 'Shield', Potion: 'Potion', Scroll: 'Scroll', Ring: 'Ring', Rod: 'Rod', Staff: 'Staff', Wand: 'Wand',
  'Wondrous Item': 'Wondrous Item', Ammunition: 'Ammunition', 'Adventuring Gear': 'Adventuring Gear', "Artisan's Tools": 'Tools',
  Tools: 'Tools', 'Gaming Set': 'Tools', Instrument: 'Instrument', 'Spellcasting Focus': 'Spellcasting Focus', 'Generic Variant': 'Generic Variant',
  Mount: 'Mount & Vehicle', 'Vehicle (land)': 'Mount & Vehicle', 'Vehicle (water)': 'Mount & Vehicle', 'Vehicle (air)': 'Mount & Vehicle',
  'Vehicle (space)': 'Mount & Vehicle', 'Tack and Harness': 'Mount & Vehicle', 'Art Object': 'Treasure', Gemstone: 'Treasure',
  Treasure: 'Treasure', Coinage: 'Treasure', 'Trade Good': 'Treasure', 'Food and Drink': 'Food & Drink', Explosive: 'Explosive',
};
const capWords = (x: string) => x.replace(/\b\w/g, (m) => m.toUpperCase());

/** Values to filter on, like 5etools' filter panels. Every value is a string; lists mean "any of". */
function facetsOf(cat: string, o: Out): Record<string, string | string[]> {
  const d = (o.data ?? {}) as Json;
  const f: Record<string, string | string[]> = { source: o.source, edition: CORE_2024.has(o.source) ? '2024 Core' : 'Other books' };
  const field = (k: string) => o.fields?.find(([n]) => n === k)?.[1] ?? '';
  switch (cat) {
    case 'spell': {
      f.level = String(d.level);
      f.school = d.school;
      f.class = d.classes ?? [];
      const t = field('Casting Time');
      f.time = /^Action/.test(t) ? 'Action' : /^Bonus Action/.test(t) ? 'Bonus Action' : /^Reaction/.test(t) ? 'Reaction' : 'Longer';
      f.damage = (d.damage ?? []).map(capWords);
      if (d.save) f.save = capWords(d.save);
      if (d.attack) f.attack = d.attack === 'M' ? 'Melee' : 'Ranged';
      f.tags = [d.concentration && 'Concentration', d.ritual && 'Ritual', d.heal && 'Healing'].filter(Boolean);
      break;
    }
    case 'item':
      f.type = ITEM_GROUP[d.type] ?? 'Other';
      f.rarity = d.rarity ? capWords(d.rarity) : 'None';
      f.tags = [d.magic ? 'Magic' : 'Mundane', d.attunement && 'Requires Attunement'].filter(Boolean);
      break;
    case 'feat':
      f.category = (o.subtitle.match(/^(.*? Feat)/)?.[1] ?? 'Feat').replace(/ \(.*/, '');
      if (f.category === 'Feat') f.category = 'Uncategorized';
      if (/Prerequisite/.test(o.subtitle)) f.tags = ['Has Prerequisite'];
      break;
    case 'optionalfeature':
      f.type = o.subtitle.replace(/ \(Prerequisite.*/, '').split(', ');
      break;
    case 'classfeature':
      f.class = d.className;
      f.level = String(d.level);
      break;
    case 'subclassfeature':
      f.class = d.className;
      f.subclass = d.subclass;
      f.level = String(d.level);
      break;
    case 'condition':
    case 'rule':
      f.kind = o.subtitle;
      break;
    case 'species':
      f.kind = o.subtitle.startsWith('Subrace') ? 'Subrace' : o.source === 'XPHB' ? '2024 Species' : 'Legacy Race';
      break;
  }
  for (const k of Object.keys(f)) if (Array.isArray(f[k]) && !(f[k] as string[]).length) delete f[k];
  return f;
}

// ---------- write ----------
mkdirSync(OUT, { recursive: true });
const index: [string, string, string, string, string, Record<string, string | string[]>][] = [];
const counts: Record<string, number> = {};
for (const [cat, list] of outputs) {
  // Same id twice means two records collapsed (e.g. copy chains); keep the last.
  const byId = new Map(list.map((o) => [o.id, o]));
  const sorted = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  counts[cat] = sorted.length;
  writeFileSync(join(OUT, `${cat}.json`), JSON.stringify(Object.fromEntries(sorted.map(({ id, ...rest }) => [id, rest]))));
  for (const o of sorted) index.push([o.id, o.name, cat, o.source, o.subtitle, facetsOf(cat, o)]);
}
const usedSources = [...new Set(index.map((e) => e[3]))].sort();
writeFileSync(
  join(OUT, 'index.json'),
  JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources: Object.fromEntries(usedSources.map((s) => [s, sourceName.get(s) ?? s])), entries: index }),
);
console.log(counts, `total ${index.length}`);
if (warnings.size) console.log('warnings', Object.fromEntries(warnings));
