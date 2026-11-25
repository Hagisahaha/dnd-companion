import { describe, expect, it } from 'vitest';
import { getEntry, getIndex, resolveLink, search } from './store';
import { parseInline, plainText } from './tags';

describe('parseInline', () => {
  it('turns link tags into links with display text', () => {
    expect(parseInline('a {@variantrule Sphere [Area of Effect]|XPHB|Sphere} b')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'link', text: 'Sphere', tag: 'variantrule', ref: 'Sphere [Area of Effect]|XPHB|Sphere' },
      { kind: 'text', text: ' b' },
    ]);
  });

  it('makes dice tappable', () => {
    expect(parseInline('takes {@damage 8d6} fire')[1]).toEqual({ kind: 'dice', text: '8d6', formula: '8d6' });
    expect(parseInline('{@hit 5} to hit')[0]).toEqual({ kind: 'dice', text: '+5', formula: '1d20+5' });
    expect(parseInline('{@scaledamage 8d6|3-9|1d6}')[0]).toMatchObject({ text: '1d6', formula: '1d6' });
  });

  it('handles nesting and formatting', () => {
    expect(plainText('{@b Hit: {@damage 2d6}} and {@dc 15}')).toBe('Hit: 2d6 and DC 15');
    expect(parseInline('{@b x}')[0]).toEqual({ kind: 'text', text: 'x', style: 'bold' });
  });

  it('survives unterminated tags', () => {
    expect(plainText('oops {@b never closed')).toBe('oops {@b never closed');
  });
});

describe('compendium data', () => {
  it('has the 2024 core content and no superseded duplicates', () => {
    const idx = getIndex();
    const names = (cat: string, name: string) => idx.filter((e) => e.cat === cat && e.name === name).map((e) => e.source);
    expect(names('spell', 'Fireball')).toEqual(['XPHB']);
    expect(names('feat', 'Great Weapon Master')).toEqual(['XPHB']);
    expect(names('species', 'Elf')).toContain('XPHB'); // settings (e.g. Lorwyn) print their own elves
    expect(names('species', 'Elf')).not.toContain('PHB');
    expect(idx.filter((e) => e.cat === 'classfeature' && e.name === 'Rage').map((e) => e.subtitle)).toEqual(['Barbarian 1']);
    expect(new Set(idx.map((e) => e.id)).size).toBe(idx.length);
  });

  it('renders spell fields as printed in the 2024 PHB', () => {
    const fb = getEntry('spell:fireball|xphb')!;
    expect(fb.subtitle).toBe('Level 3 Evocation');
    expect(Object.fromEntries(fb.fields!)).toMatchObject({
      'Casting Time': 'Action',
      Range: '150 feet',
      Duration: 'Instantaneous',
      Classes: 'Sorcerer, Wizard',
    });
    const bless = getEntry('spell:bless|xphb')!;
    expect(Object.fromEntries(bless.fields!).Duration).toBe('Concentration, up to 1 minute');
  });

  it('every link tag in core 2024 spells resolves', () => {
    const spells = getIndex().filter((e) => e.cat === 'spell' && e.source === 'XPHB');
    const missing: string[] = [];
    for (const s of spells) {
      const text = JSON.stringify(getEntry(s.id)!.entries);
      for (const m of text.matchAll(/\{@(spell|condition|variantrule|action|item|feat) ([^}]+)\}/g)) {
        if (!resolveLink(m[1], m[2])) missing.push(`${s.name}: ${m[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('ranks exact and prefix matches first', () => {
    expect(search('fireball', null)[0].name).toBe('Fireball');
    expect(search('hunters mark', 'spell')[0].name).toBe("Hunter's Mark");
    expect(search('long', 'item')[0].name.toLowerCase().startsWith('long')).toBe(true);
  });
});

describe('background origin feats', () => {
  it('every background feat resolves to a compendium feat', async () => {
    const { RULES } = await import('../character/rules');
    const unresolved = RULES.backgrounds
      .filter((b) => b.feat && b.feat !== 'anyFromCategory')
      .filter((b) => {
        const [name, source] = b.feat!.split('|');
        return !resolveLink('feat', `${name.split(';')[0].trim()}${source ? `|${source}` : ''}`);
      })
      .map((b) => b.name);
    expect(unresolved).toEqual([]);
  });
});
