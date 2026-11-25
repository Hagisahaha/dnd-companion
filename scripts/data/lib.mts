/** Shared loading, source policy and _copy resolution for the 5etools build scripts. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RAW = 'data-raw/5etools';
export type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export const read = (p: string): Json => JSON.parse(readFileSync(join(RAW, p), 'utf8'));
export const warnings = new Map<string, number>();
export const warn = (k: string) => warnings.set(k, (warnings.get(k) ?? 0) + 1);

// ---------- sources ----------
export const books: Json[] = read('books.json').book;
export const advs: Json[] = read('adventures.json').adventure;
export const EXCLUDED_GROUPS = new Set(['screen', 'recipe', 'homecraft']);
export const EXCLUDED_SOURCES = new Set(['WoW']);
export const sourceName = new Map<string, string>();
export const sourceOk = new Map<string, boolean>();
for (const b of [...books, ...advs]) {
  sourceName.set(b.source, b.name);
  sourceOk.set(b.source, !EXCLUDED_GROUPS.has(b.group) && !EXCLUDED_SOURCES.has(b.source));
}
export const isOfficial = (src: string) => !!src && !src.startsWith('UA') && !EXCLUDED_SOURCES.has(src) && (sourceOk.get(src) ?? true);

// ---------- _copy resolution ----------
// Subclasses and their features repeat name+source across classes, so the key carries the owner too.
export const keyOf = (e: Json) =>
  [e.name, e.source, e.className, e.classSource, e.shortName, e.subclassShortName, e.subclassSource, e.level]
    .map((v) => (v === undefined ? '' : String(v)))
    .join('|')
    .toLowerCase();

function applyMod(target: Json, prop: string, mod: Json) {
  const ops = Array.isArray(mod) ? mod : [mod];
  for (const op of ops) {
    if (op === 'remove') {
      delete target[prop];
      continue;
    }
    const arr = () => (target[prop] ??= []);
    const items = op.items === undefined ? [] : Array.isArray(op.items) ? op.items : [op.items];
    switch (op.mode) {
      case 'appendArr':
      case 'appendIfNotExistsArr':
        arr().push(...items);
        break;
      case 'prependArr':
        arr().unshift(...items);
        break;
      case 'insertArr':
        arr().splice(op.index, 0, ...items);
        break;
      case 'replaceArr': {
        const a = arr();
        const i = typeof op.replace === 'string'
          ? a.findIndex((x: Json) => x === op.replace || x?.name === op.replace)
          : op.replace?.index ?? -1;
        if (i >= 0) a.splice(i, 1, ...items);
        else warn(`replaceArr miss`);
        break;
      }
      case 'removeArr': {
        const names: Json[] = op.names ? ([] as Json[]).concat(op.names) : [];
        target[prop] = arr().filter((x: Json) => !names.includes(x?.name ?? x) && !(op.items && ([] as Json[]).concat(op.items).includes(x)));
        break;
      }
      case 'replaceTxt': {
        const re = new RegExp(op.replace, op.flags ?? 'g');
        const walk = (v: Json): Json =>
          typeof v === 'string' ? v.replace(re, op.with) : Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'type' ? x : walk(x)])) : v;
        if (target[prop] !== undefined) target[prop] = walk(target[prop]);
        break;
      }
      default:
        warn(`unsupported _mod ${op.mode}`);
    }
  }
}

export function resolveCopies(list: Json[]): Json[] {
  const byKey = new Map(list.map((e) => [keyOf(e), e]));
  const done = new Map<Json, Json>();
  const resolve = (e: Json, depth = 0): Json => {
    if (!e._copy) return e;
    if (done.has(e)) return done.get(e);
    const base = byKey.get(keyOf(e._copy));
    if (!base || base === e || depth > 5) {
      warn('copy base missing');
      const { _copy, ...rest } = e;
      return rest;
    }
    const b = structuredClone(resolve(base, depth + 1));
    const preserve = e._copy._preserve ?? {};
    for (const k of Object.keys(b)) if (['reprintedAs', 'page', 'srd', 'basicRules', 'otherSources', 'srd52', 'basicRules2024'].includes(k) && !preserve[k]) delete b[k];
    const { _copy, ...own } = e;
    const merged = { ...b, ...own };
    for (const [prop, mod] of Object.entries(_copy._mod ?? {})) {
      if (prop === '*') {
        for (const p of ['entries', 'entriesHigherLevel']) if (merged[p]) applyMod(merged, p, mod);
      } else if (prop !== '_') applyMod(merged, prop, mod);
    }
    done.set(e, merged);
    return merged;
  };
  return list.map((e) => resolve(e));
}

export const keep = (e: Json) => isOfficial(e.source) && !e.reprintedAs && !e.reskinOf;
export const stripSrc = (s: string) => String(s).split('|')[0];
