/**
 * Downloads the 5etools data files the compendium is built from into data-raw/5etools.
 * Run: npm run data:fetch   (then npm run data:build)
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/';
const OUT = 'data-raw/5etools';
const force = process.argv.includes('--force');

const FILES = [
  'books.json', 'adventures.json',
  'items.json', 'items-base.json', 'magicvariants.json',
  'feats.json', 'races.json', 'backgrounds.json',
  'conditionsdiseases.json', 'actions.json', 'optionalfeatures.json',
  'variantrules.json', 'skills.json', 'senses.json', 'languages.json',
  'spells/sources.json',
];

async function get(path: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(BASE + path);
    if (res.ok) return res.text();
    if (attempt >= 4) throw new Error(`${path}: HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
}

async function save(path: string) {
  const dest = join(OUT, path);
  if (!force && existsSync(dest)) return;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, await get(path));
  console.log('fetched', path);
}

for (const dir of ['spells', 'class']) {
  await save(`${dir}/index.json`);
  const index = JSON.parse(await get(`${dir}/index.json`)) as Record<string, string>;
  await Promise.all(Object.values(index).map((f) => save(`${dir}/${f}`)));
}
await Promise.all(FILES.map(save));
console.log('done');
