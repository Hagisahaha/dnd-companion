import type { Category, IndexEntry } from './store';

export interface FacetDef {
  key: string;
  label: string;
  /** Fixed display order; values not listed come after, alphabetically. */
  order?: string[];
  /** Pretty label for a value. */
  format?: (v: string) => string;
}

const LEVEL_LABEL = (v: string) => (v === '0' ? 'Cantrip' : `Level ${v}`);
const RARITY = ['None', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies', 'Unknown'];
const numeric = (max: number) => Array.from({ length: max + 1 }, (_, i) => String(i));

const EDITION: FacetDef = { key: 'edition', label: 'Rules', order: ['2024 Core', 'Other books'] };
const SOURCE: FacetDef = { key: 'source', label: 'Source' };

/** Filter panels per category, modelled on 5etools' filters. */
export const FACETS: Record<Category | 'all', FacetDef[]> = {
  all: [EDITION, SOURCE],
  spell: [
    { key: 'level', label: 'Level', order: numeric(9), format: LEVEL_LABEL },
    { key: 'class', label: 'Class' },
    { key: 'school', label: 'School' },
    { key: 'time', label: 'Casting Time', order: ['Action', 'Bonus Action', 'Reaction', 'Longer'] },
    { key: 'tags', label: 'Properties', order: ['Concentration', 'Ritual', 'Healing'] },
    { key: 'damage', label: 'Damage Type' },
    { key: 'save', label: 'Saving Throw', order: ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'] },
    { key: 'attack', label: 'Spell Attack', order: ['Melee', 'Ranged'] },
    EDITION,
    SOURCE,
  ],
  item: [
    { key: 'type', label: 'Type' },
    { key: 'rarity', label: 'Rarity', order: RARITY },
    { key: 'tags', label: 'Properties', order: ['Magic', 'Mundane', 'Requires Attunement'] },
    EDITION,
    SOURCE,
  ],
  feat: [
    { key: 'category', label: 'Category', order: ['Origin Feat', 'General Feat', 'Fighting Style Feat', 'Epic Boon Feat'] },
    { key: 'tags', label: 'Prerequisite' },
    EDITION,
    SOURCE,
  ],
  classfeature: [{ key: 'class', label: 'Class' }, { key: 'level', label: 'Level', order: numeric(20), format: LEVEL_LABEL }, EDITION, SOURCE],
  subclassfeature: [
    { key: 'class', label: 'Class' },
    { key: 'subclass', label: 'Subclass' },
    { key: 'level', label: 'Level', order: numeric(20), format: LEVEL_LABEL },
    EDITION,
    SOURCE,
  ],
  optionalfeature: [{ key: 'type', label: 'Type' }, EDITION, SOURCE],
  species: [{ key: 'kind', label: 'Kind', order: ['2024 Species', 'Legacy Race', 'Subrace'] }, EDITION, SOURCE],
  background: [EDITION, SOURCE],
  condition: [{ key: 'kind', label: 'Kind', order: ['Condition', 'Status', 'Disease'] }, EDITION, SOURCE],
  action: [EDITION, SOURCE],
  rule: [{ key: 'kind', label: 'Kind' }, EDITION, SOURCE],
};

export interface SortDef {
  key: string;
  label: string;
  /** Facet whose value groups the list into sections (in that facet's order). */
  group?: string;
}

export const SORTS: Record<Category | 'all', SortDef[]> = {
  all: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Category', group: '__cat' }],
  spell: [{ key: 'name', label: 'Name' }, { key: 'level', label: 'Level', group: 'level' }, { key: 'school', label: 'School', group: 'school' }],
  item: [{ key: 'name', label: 'Name' }, { key: 'rarity', label: 'Rarity', group: 'rarity' }, { key: 'type', label: 'Type', group: 'type' }],
  feat: [{ key: 'name', label: 'Name' }, { key: 'category', label: 'Category', group: 'category' }],
  classfeature: [{ key: 'name', label: 'Name' }, { key: 'class', label: 'Class', group: 'class' }, { key: 'level', label: 'Level', group: 'level' }],
  subclassfeature: [{ key: 'name', label: 'Name' }, { key: 'subclass', label: 'Subclass', group: 'subclass' }, { key: 'level', label: 'Level', group: 'level' }],
  optionalfeature: [{ key: 'name', label: 'Name' }, { key: 'type', label: 'Type', group: 'type' }],
  species: [{ key: 'name', label: 'Name' }, { key: 'kind', label: 'Kind', group: 'kind' }],
  background: [{ key: 'name', label: 'Name' }],
  condition: [{ key: 'name', label: 'Name' }, { key: 'kind', label: 'Kind', group: 'kind' }],
  action: [{ key: 'name', label: 'Name' }],
  rule: [{ key: 'name', label: 'Name' }, { key: 'kind', label: 'Kind', group: 'kind' }],
};

/** Selected values per facet. Within a facet values are OR'd; facets are AND'd (5etools behaviour). */
export type Filters = Record<string, string[]>;

const valuesOf = (e: IndexEntry, key: string): string[] => {
  const v = e.facets[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};

export function matches(e: IndexEntry, filters: Filters, skip?: string): boolean {
  for (const [key, wanted] of Object.entries(filters)) {
    if (key === skip || !wanted.length) continue;
    const have = valuesOf(e, key);
    if (!wanted.some((w) => have.includes(w))) return false;
  }
  return true;
}

export function orderValues(def: FacetDef, values: Iterable<string>): string[] {
  const order = def.order ?? [];
  return [...values].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return a.localeCompare(b);
  });
}

/** Each facet value with how many entries would match if it were picked (other facets applied). */
export function facetCounts(entries: IndexEntry[], def: FacetDef, filters: Filters): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    if (!matches(e, filters, def.key)) continue;
    for (const v of valuesOf(e, def.key)) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return orderValues(def, counts.keys()).map((value) => ({ value, count: counts.get(value)! }));
}

export const activeCount = (f: Filters) => Object.values(f).reduce((s, v) => s + v.length, 0);

/** Sorts (and optionally groups) a filtered list. Group headers follow the facet's display order. */
export function arrange(entries: IndexEntry[], cat: Category | 'all', sortKey: string, catLabel: (c: Category) => string): { title: string | null; data: IndexEntry[] }[] {
  const sort = SORTS[cat].find((x) => x.key === sortKey) ?? SORTS[cat][0];
  if (!sort.group) return [{ title: null, data: entries }];
  const groupOf = (e: IndexEntry) => (sort.group === '__cat' ? catLabel(e.cat) : valuesOf(e, sort.group!)[0] ?? '—');
  const def = FACETS[cat].find((f) => f.key === sort.group) ?? { key: sort.group, label: sort.label };
  const groups = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const g = groupOf(e);
    groups.set(g, [...(groups.get(g) ?? []), e]);
  }
  return orderValues(def, groups.keys()).map((g) => ({ title: def.format ? def.format(g) : g, data: groups.get(g)! }));
}
