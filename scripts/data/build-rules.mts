/**
 * Builds src/data/rules.json: the structured numbers the character engine needs
 * (classes, subclasses, species, backgrounds, armor, skills) for the 2024 rules.
 * Run: npm run data:build  (runs after the compendium build)
 */
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Json, RAW, isOfficial, keep, read, resolveCopies, stripSrc } from './lib.mts';

type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
const ABILS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABIL_NAME: Record<string, Ability> = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const plain = (s: string) => String(s).replace(/\{@\w+ ([^|}]*)[^}]*\}/g, '$1');
const cell = (v: Json): string =>
  typeof v === 'number' ? String(v)
  : typeof v === 'string' ? plain(v)
  : v?.type === 'bonus' ? `+${v.value}`
  : v?.type === 'bonusSpeed' ? `+${v.value} ft.`
  : v?.type === 'dice' ? v.toRoll.map((d: Json) => `${d.number}d${d.faces}`).join('+')
  : v?.value !== undefined ? String(v.value) : '';
const id = (cat: string, idName: string, source: string) => `${cat}:${idName}|${source}`.toLowerCase();

// ---------- classes ----------
const files = readdirSync(join(RAW, 'class')).filter((f) => f.startsWith('class-'));
const allSubclasses: Json[] = [];
const allSubFeatures: Json[] = [];
const rawClasses: Json[] = [];
for (const f of files) {
  const d = read(`class/${f}`);
  rawClasses.push(...(d.class ?? []));
  allSubclasses.push(...(d.subclass ?? []));
  allSubFeatures.push(...(d.subclassFeature ?? []));
}
const subFeatures = resolveCopies(allSubFeatures);
const subclasses = resolveCopies(allSubclasses);

const classes = rawClasses
  .filter((c) => c.source === 'XPHB')
  .map((c) => {
    const labels: string[] = [];
    const cols: string[][] = [];
    for (const g of c.classTableGroups ?? []) {
      g.colLabels.forEach((l: string, i: number) => {
        labels.push(plain(l));
        cols.push((g.rowsSpellProgression ?? g.rows).map((r: Json[]) => cell(r[i])));
      });
    }
    const col = (label: string) => {
      const i = labels.indexOf(label);
      return i < 0 ? null : cols[i].map((v) => Number(v) || 0);
    };
    const slots = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(col);
    const hasSlots = slots.some(Boolean);
    const features = c.classFeatures
      .map((x: Json) => {
        const ref = typeof x === 'string' ? x : x.classFeature;
        // name|className|classSource|level|featureSource — the feature source differs when a
        // supplement (e.g. WoW) injects features into the core class list.
        const [name, className, classSource, level, featureSource] = ref.split('|');
        const source = featureSource || classSource || 'PHB';
        return { name, level: Number(level), source, id: id('classfeature', `${name}|${className}|${level}`, source), subclass: typeof x === 'object' && !!x.gainSubclassFeature };
      })
      .filter((f: Json) => isOfficial(f.source))
      .map(({ source: _s, ...f }: Json) => f);
    const subclassLevels = features.filter((f: Json) => f.subclass).map((f: Json) => f.level);
    const scs = subclasses
      .filter((s) => s.className === c.name && s.classSource === 'XPHB' && keep(s) && isOfficial(s.source))
      .map((s) => ({
        name: s.name,
        shortName: s.shortName,
        source: s.source,
        features: (s.subclassFeatures ?? []).map((r: Json) => {
          const ref = typeof r === 'string' ? r : r.subclassFeature;
          const [name, className, classSource, short, subSource, level] = ref.split('|');
          const rec = subFeatures.find((x) => x.name === name && x.className === className && (x.classSource ?? 'PHB') === (classSource || 'PHB')
            && x.subclassShortName === short && (x.subclassSource ?? 'PHB') === (subSource || 'PHB') && x.level === Number(level));
          return { name, level: Number(level), id: rec ? id('subclassfeature', `${name}|${className}|${short}|${level}`, rec.source) : null };
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const sk = c.startingProficiencies?.skills?.[0];
    const skillChoice = sk?.choose ? { from: sk.choose.from, count: sk.choose.count } : sk?.any ? { from: 'any', count: sk.any } : null;
    const caster = c.casterProgression === 'artificer' ? 'half' : c.casterProgression ?? null;
    return {
      name: c.name,
      source: c.source,
      hitDie: c.hd.faces,
      saves: c.proficiency as Ability[],
      primary: Object.keys(Object.assign({}, ...(c.primaryAbility ?? []))),
      armor: (c.startingProficiencies?.armor ?? []).map((a: Json) => plain(typeof a === 'string' ? a : a.full ?? a.proficiency)),
      weapons: (c.startingProficiencies?.weapons ?? []).map((a: Json) => plain(typeof a === 'string' ? a : a.proficiency)),
      skillChoice,
      caster,
      spellAbility: c.spellcastingAbility ?? null,
      cantrips: c.cantripProgression ?? null,
      prepared: c.preparedSpellsProgression ?? null,
      slots: hasSlots ? Array.from({ length: 20 }, (_, lvl) => slots.map((s) => (s ? s[lvl] : 0))) : null,
      pact: caster === 'pact' ? { slots: col('Spell Slots'), level: cols[labels.indexOf('Slot Level')].map((v) => parseInt(v, 10)) } : null,
      table: { labels, cols },
      features: features.map(({ subclass: _, ...f }: Json) => f),
      subclassLevels,
      asiLevels: features.filter((f: Json) => f.name === 'Ability Score Improvement').map((f: Json) => f.level),
      multiclass: { armor: c.multiclassing?.proficienciesGained?.armor ?? [], weapons: c.multiclassing?.proficienciesGained?.weapons ?? [] },
      subclasses: scs,
    };
  });

// ---------- species ----------
const racesFile = read('races.json');
const species = resolveCopies(racesFile.race)
  .filter(keep)
  .map((r: Json) => ({
    id: id('species', r.name, r.source),
    name: r.name,
    source: r.source,
    size: r.size ?? ['M'],
    speed: typeof r.speed === 'number' ? r.speed : r.speed?.walk ?? 30,
    darkvision: r.darkvision ?? null,
  }))
  .sort((a: Json, b: Json) => (a.source === 'XPHB' ? 0 : 1) - (b.source === 'XPHB' ? 0 : 1) || a.name.localeCompare(b.name));

// ---------- backgrounds ----------
const backgrounds = resolveCopies(read('backgrounds.json').background)
  .filter(keep)
  .map((b: Json) => {
    const ab = b.ability?.[0];
    const from: Ability[] = ab?.choose?.weighted?.from ?? ab?.choose?.from ?? [];
    return {
      id: id('background', b.name, b.source),
      name: b.name,
      source: b.source,
      abilities: from,
      skills: Object.keys(Object.assign({}, ...(b.skillProficiencies ?? [])) as Record<string, unknown>).filter((k) => k !== 'choose' && k !== 'any'),
      feat: Object.keys(Object.assign({}, ...(b.feats ?? []))).map((k) => k)[0] ?? null,
    };
  })
  .sort((a: Json, b: Json) => (a.source === 'XPHB' ? 0 : 1) - (b.source === 'XPHB' ? 0 : 1) || a.name.localeCompare(b.name));

// ---------- armor & skills ----------
const ARMOR_KIND: Record<string, string> = { LA: 'light', MA: 'medium', HA: 'heavy', S: 'shield' };
const armor = read('items-base.json').baseitem
  .filter((i: Json) => i.source === 'XPHB' && ARMOR_KIND[stripSrc(i.type ?? '')])
  .map((i: Json) => ({
    id: id('item', i.name, i.source),
    name: i.name,
    kind: ARMOR_KIND[stripSrc(i.type)],
    ac: i.ac,
    strength: i.strength ? Number(i.strength) : null,
    stealthDisadvantage: !!i.stealth,
  }))
  .sort((a: Json, b: Json) => a.ac - b.ac);

const PROP: Record<string, string> = { A: 'ammunition', F: 'finesse', H: 'heavy', L: 'light', LD: 'loading', R: 'reach', T: 'thrown', '2H': 'two-handed', V: 'versatile' };
const weapons = read('items-base.json').baseitem
  .filter((i: Json) => i.source === 'XPHB' && i.weapon)
  .map((i: Json) => ({
    id: id('item', i.name, i.source),
    name: i.name,
    category: i.weaponCategory as 'simple' | 'martial',
    ranged: stripSrc(i.type) === 'R',
    damage: i.dmg1,
    versatile: i.dmg2 ?? null,
    damageType: ({ B: 'bludgeoning', P: 'piercing', S: 'slashing' } as Record<string, string>)[i.dmgType] ?? i.dmgType,
    properties: (i.property ?? []).map((p: Json) => PROP[stripSrc(typeof p === 'string' ? p : p.uid)]).filter(Boolean),
    mastery: i.mastery ? stripSrc(i.mastery[0]) : null,
    range: i.range ?? null,
  }))
  .sort((a: Json, b: Json) => a.name.localeCompare(b.name));

const skills = read('skills.json').skill
  .filter((s: Json) => s.source === 'XPHB')
  .map((s: Json) => ({ name: s.name, ability: s.ability as Ability }))
  .sort((a: Json, b: Json) => a.name.localeCompare(b.name));

mkdirSync('src/data', { recursive: true });
writeFileSync('src/data/rules.json', JSON.stringify({ classes, species, backgrounds, armor, weapons, skills }));
console.log({
  classes: classes.map((c) => `${c.name}(${c.subclasses.length})`).join(' '),
  species: species.length, backgrounds: backgrounds.length, armor: armor.length, weapons: weapons.length, skills: skills.length,
  unresolvedSubclassFeatures: classes.flatMap((c) => c.subclasses.flatMap((s: Json) => s.features.filter((f: Json) => !f.id).map((f: Json) => `${c.name}/${s.shortName}/${f.name}`))).slice(0, 10),
});
void ABILS; void ABIL_NAME;
