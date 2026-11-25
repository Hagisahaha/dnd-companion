/**
 * Lazy access to the bundled compendium. Nothing here is loaded at app start:
 * the search index is required the first time search opens, and each category
 * file the first time one of its entries is shown.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const LOADERS = {
  spell: () => require('../data/compendium/spell.json'),
  item: () => require('../data/compendium/item.json'),
  feat: () => require('../data/compendium/feat.json'),
  background: () => require('../data/compendium/background.json'),
  species: () => require('../data/compendium/species.json'),
  condition: () => require('../data/compendium/condition.json'),
  action: () => require('../data/compendium/action.json'),
  rule: () => require('../data/compendium/rule.json'),
  optionalfeature: () => require('../data/compendium/optionalfeature.json'),
  classfeature: () => require('../data/compendium/classfeature.json'),
  subclassfeature: () => require('../data/compendium/subclassfeature.json'),
} as const;
/* eslint-enable @typescript-eslint/no-require-imports */

export type Category = keyof typeof LOADERS;

export const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'spell', label: 'Spells' },
  { key: 'item', label: 'Items' },
  { key: 'classfeature', label: 'Class Features' },
  { key: 'subclassfeature', label: 'Subclass Features' },
  { key: 'feat', label: 'Feats' },
  { key: 'species', label: 'Species' },
  { key: 'background', label: 'Backgrounds' },
  { key: 'optionalfeature', label: 'Options' },
  { key: 'condition', label: 'Conditions' },
  { key: 'action', label: 'Actions' },
  { key: 'rule', label: 'Rules' },
];

export interface IndexEntry {
  id: string;
  name: string;
  cat: Category;
  source: string;
  subtitle: string;
  /** Lowercased, punctuation-free name for matching. */
  key: string;
}

export interface Entry {
  id: string;
  name: string;
  source: string;
  page?: number;
  subtitle: string;
  fields?: [string, string][];
  entries: unknown[];
  data?: Record<string, unknown>;
}

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let index: IndexEntry[] | null = null;
let sources: Record<string, string> = {};
let byName: Map<string, IndexEntry[]> | null = null;

export function getIndex(): IndexEntry[] {
  if (!index) {
    const raw = require('../data/compendium/index.json') as { sources: Record<string, string>; entries: [string, string, Category, string, string][] };
    sources = raw.sources;
    index = raw.entries.map(([id, name, cat, source, subtitle]) => ({ id, name, cat, source, subtitle, key: normalize(name) }));
  }
  return index;
}

export function sourceName(abbr: string): string {
  getIndex();
  return sources[abbr] ?? abbr;
}

const cache = new Map<Category, Record<string, Omit<Entry, 'id'>>>();
export function getEntry(id: string): Entry | null {
  const cat = id.slice(0, id.indexOf(':')) as Category;
  const loader = LOADERS[cat];
  if (!loader) return null;
  let data = cache.get(cat);
  if (!data) {
    data = loader() as Record<string, Omit<Entry, 'id'>>;
    cache.set(cat, data);
  }
  const e = data[id];
  return e ? { id, ...e } : null;
}

/** Newer printings first, so an unqualified link lands on the 2024 version. */
const SOURCE_RANK = ['XPHB', 'XDMG', 'XMM'];
const rank = (s: string) => {
  const i = SOURCE_RANK.indexOf(s);
  return i < 0 ? SOURCE_RANK.length : i;
};

const TAG_CAT: Record<string, Category> = {
  spell: 'spell', item: 'item', feat: 'feat', background: 'background', race: 'species',
  condition: 'condition', disease: 'condition', status: 'condition', action: 'action',
  variantrule: 'rule', optfeature: 'optionalfeature', classFeature: 'classfeature', subclassFeature: 'subclassfeature',
};

/** Resolves a 5etools tag reference to a compendium id, or null if we don't carry that entry. */
export function resolveLink(tag: string, ref: string): string | null {
  const cat = TAG_CAT[tag];
  if (!cat) return null;
  const parts = ref.split('|');
  const name = normalize(parts[0]);
  if (!byName) {
    byName = new Map();
    for (const e of getIndex()) {
      const k = `${e.cat}:${e.key}`;
      const list = byName.get(k) ?? [];
      list.push(e);
      byName.set(k, list);
    }
  }
  let list = byName.get(`${cat}:${name}`) ?? [];
  if (cat === 'classfeature' && parts[1]) list = list.filter((e) => e.subtitle.startsWith(parts[1]) && (!parts[3] || e.subtitle.endsWith(` ${parts[3]}`)));
  if (cat === 'subclassfeature' && parts[1]) list = list.filter((e) => e.subtitle.startsWith(parts[1]) && (!parts[5] || e.subtitle.endsWith(` ${parts[5]}`)));
  if (!list.length) return null;
  const wanted = (cat === 'classfeature' ? parts[2] : cat === 'subclassfeature' ? parts[4] : parts[1])?.toUpperCase();
  const exact = wanted ? list.find((e) => e.source.toUpperCase() === wanted) : undefined;
  return (exact ?? [...list].sort((a, b) => rank(a.source) - rank(b.source))[0]).id;
}

/**
 * Ranked search: exact name, then prefix, then word-prefix, then substring.
 * Within a tier, 2024 printings first, then alphabetical.
 */
export function search(query: string, cat: Category | null, limit = 200): IndexEntry[] {
  const all = getIndex();
  const q = normalize(query);
  const pool = cat ? all.filter((e) => e.cat === cat) : all;
  if (!q) return pool.slice(0, limit);
  const scored: [number, IndexEntry][] = [];
  for (const e of pool) {
    let s = -1;
    if (e.key === q) s = 0;
    else if (e.key.startsWith(q)) s = 1;
    else if (e.key.includes(` ${q}`)) s = 2;
    else if (e.key.includes(q)) s = 3;
    if (s >= 0) scored.push([s * 10 + Math.min(rank(e.source), 3), e]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, limit).map(([, e]) => e);
}
