import { describe, expect, it } from 'vitest';
import { addDice, attacks, castOptions, castSpell, maxSpellLevel, spellListFor, spells } from './combat';
import { derive, newCharacter } from './engine';
import type { Character } from './types';

const make = (p: Partial<Character>): Character => ({ ...newCharacter('t'), ...p });

describe('addDice', () => {
  it('merges same dice and keeps mixed ones', () => {
    expect(addDice('8d6', '1d6', 2)).toBe('10d6');
    expect(addDice('2d8', '2d8', 1)).toBe('4d8');
    expect(addDice('1d8+3', '1d6', 1)).toBe('1d8+1d6+3');
    expect(addDice('3d4+3', '1d4+1', 0)).toBe('3d4+3');
  });
});

describe('attacks', () => {
  const scores = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

  it('fighter longsword: STR, proficient, versatile, mastery', () => {
    const base = make({ classes: [{ name: 'Fighter', level: 1, subclass: null }], baseScores: scores, weapons: [{ key: 'a', itemId: 'item:longsword|xphb', bonus: 0 }] });
    // Mastery only for weapons picked under Weapon Mastery.
    expect(attacks(base)[0].mastery).toBeNull();
    const c = { ...base, choices: { 'Fighter:mastery': ['item:longsword|xphb'] } };
    const ls = attacks(c)[0];
    expect(ls.toHit.value).toBe(5);
    expect(ls.damage).toBe('1d8+3');
    expect(ls.twoHanded).toBe('1d10+3');
    expect(ls.mastery).toBe('Sap');
  });

  it('finesse uses the better of STR and DEX; magic bonus adds to both', () => {
    const c = make({ classes: [{ name: 'Rogue', level: 1, subclass: null }], baseScores: { ...scores, str: 10, dex: 18 }, weapons: [{ key: 'r', itemId: 'item:rapier|xphb', bonus: 1 }] });
    const r = attacks(c)[0];
    expect(r.proficient).toBe(true); // rogue: martial weapons with Finesse
    expect(r.toHit.value).toBe(4 + 2 + 1);
    expect(r.damage).toBe('1d8+5');
  });

  it('wizard with a longsword is not proficient', () => {
    const c = make({ classes: [{ name: 'Wizard', level: 1, subclass: null }], baseScores: scores, weapons: [{ key: 'a', itemId: 'item:longsword|xphb', bonus: 0 }] });
    expect(attacks(c)[0]).toMatchObject({ proficient: false, toHit: { value: 3 } });
  });

  it('monk uses DEX and the Martial Arts die for monk weapons and unarmed', () => {
    const c = make({ classes: [{ name: 'Monk', level: 5, subclass: null }], baseScores: { ...scores, str: 10, dex: 16 }, weapons: [{ key: 'q', itemId: 'item:quarterstaff|xphb', bonus: 0 }] });
    const [staff, unarmed] = attacks(c);
    expect(staff.damage).toBe('1d8+3');
    expect(unarmed.damage).toBe('1d8+3');
    expect(unarmed.toHit.value).toBe(3 + 3);
  });

  it('unarmed strike for everyone else is 1 + STR', () => {
    expect(attacks(make({ baseScores: scores })).at(-1)!.damage).toBe('4');
  });
});

describe('spells', () => {
  const wiz = make({
    classes: [{ name: 'Wizard', level: 5, subclass: null }],
    baseScores: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
    backgroundBonus: { int: 2, con: 1 },
    spells: [
      { id: 'spell:fireball|xphb', className: 'Wizard', prepared: true },
      { id: 'spell:fire bolt|xphb', className: 'Wizard', prepared: false },
      { id: 'spell:detect magic|xphb', className: 'Wizard', prepared: false },
    ],
  });
  const d = derive(wiz);
  const list = spells(wiz, d);
  const by = (n: string) => list.find((s) => s.name === n)!;

  it('fireball: DEX save vs DC, 8d6 upcast +1d6 per level', () => {
    expect(by('Fireball').save).toEqual({ ability: 'dex', dc: 15 });
    expect(by('Fireball').effects(3)[0]).toMatchObject({ formula: '8d6', kind: 'damage' });
    expect(by('Fireball').effects(5)[0].formula).toBe('10d6');
  });

  it('cantrips scale with character level and are always prepared', () => {
    expect(by('Fire Bolt').effects(0)[0].formula).toBe('2d10');
    expect(by('Fire Bolt').attack?.value).toBe(7);
    expect(by('Fire Bolt').prepared).toBe(true);
  });

  it('healing adds the spellcasting modifier', () => {
    const cleric = make({ classes: [{ name: 'Cleric', level: 3, subclass: null }], baseScores: { str: 10, dex: 10, con: 10, int: 10, wis: 16, cha: 10 }, spells: [{ id: 'spell:cure wounds|xphb', className: 'Cleric', prepared: true }] });
    const cw = spells(cleric)[0];
    expect(cw.effects(1)[0]).toMatchObject({ formula: '2d8+3', kind: 'healing' });
    expect(cw.effects(2)[0].formula).toBe('4d8+3');
  });

  it('casting spends the chosen slot and starts concentration', () => {
    const bless = make({ classes: [{ name: 'Cleric', level: 3, subclass: null }], spells: [{ id: 'spell:bless|xphb', className: 'Cleric', prepared: true }] });
    const dv = derive(bless);
    const s = spells(bless, dv)[0];
    expect(castOptions(s, dv).map((o) => o.label)).toEqual(['Level 1', 'Level 2']);
    const after = castSpell(bless, s, { slot: 2 });
    expect(after.slotsUsed[1]).toBe(1);
    expect(after.concentration).toBe('Bless');
    expect(castOptions(spells(after)[0], derive(after)).map((o) => o.label)).toEqual(['Level 1', 'Level 2']);
  });

  it('ritual casting is offered without a slot', () => {
    expect(castOptions(by('Detect Magic'), d)[0].label).toBe('Ritual');
  });

  it('max spell level and spell list per class', () => {
    expect(maxSpellLevel('Wizard', 5, null)).toBe(3);
    expect(maxSpellLevel('Paladin', 5, null)).toBe(2);
    expect(maxSpellLevel('Warlock', 5, null)).toBe(3);
    expect(maxSpellLevel('Fighter', 7, 'Eldritch Knight')).toBe(2);
    expect(maxSpellLevel('Fighter', 7, null)).toBe(0);
    expect(spellListFor('Rogue', 'Arcane Trickster')).toBe('Wizard');
    expect(spellListFor('Barbarian', null)).toBeNull();
  });
});

describe('automation: feats, rage, sneak attack, granted spells', () => {
  const scores = { str: 16, dex: 16, con: 14, int: 10, wis: 12, cha: 8 };

  it('feats change initiative, HP, speed, AC and add Luck Points', () => {
    const base = make({ classes: [{ name: 'Fighter', level: 4, subclass: null }], baseScores: scores, armorId: 'item:chain mail|xphb' });
    const withFeats = { ...base, feats: ['feat:alert|xphb', 'feat:tough|xphb', 'feat:speedy|xphb', 'feat:defense|xphb', 'feat:lucky|xphb'] };
    const a = derive(base);
    const b = derive(withFeats);
    expect(b.initiative.value - a.initiative.value).toBe(2);
    expect(b.maxHp.value - a.maxHp.value).toBe(8);
    expect(b.speed.value - a.speed.value).toBe(10);
    expect(b.ac.value - a.ac.value).toBe(1);
    expect(b.resources.find((r) => r.key === 'lucky')).toMatchObject({ max: 2, shortRest: 'none' });
  });

  it('archery adds to ranged attacks; dueling to one-handed melee only', () => {
    const c = make({
      classes: [{ name: 'Fighter', level: 1, subclass: null }], baseScores: scores, feats: ['feat:archery|xphb', 'feat:dueling|xphb'],
      weapons: [{ key: 'b', itemId: 'item:longbow|xphb', bonus: 0 }, { key: 's', itemId: 'item:longsword|xphb', bonus: 0 }, { key: 'g', itemId: 'item:greatsword|xphb', bonus: 0 }],
    });
    const [bow, sword, great] = attacks(c);
    expect(bow.toHit.value).toBe(3 + 2 + 2);
    expect(sword.damage).toBe('1d8+5');
    expect(sword.twoHanded).toBe('1d10+3');
    expect(great.damage).toBe('2d6+3');
  });

  it('rage adds its bonus to Strength attacks only while raging', () => {
    const c = make({ classes: [{ name: 'Barbarian', level: 9, subclass: null }], baseScores: scores, weapons: [{ key: 'a', itemId: 'item:greataxe|xphb', bonus: 0 }] });
    expect(attacks(c)[0].damage).toBe('1d12+3');
    expect(attacks({ ...c, raging: true })[0].damage).toBe('1d12+6');
    expect(attacks({ ...c, raging: true }).at(-1)!.damage).toBe('7');
  });

  it('sneak attack is offered on finesse and ranged weapons', () => {
    const c = make({ classes: [{ name: 'Rogue', level: 5, subclass: null }], baseScores: scores, weapons: [{ key: 'r', itemId: 'item:rapier|xphb', bonus: 0 }, { key: 'c', itemId: 'item:club|xphb', bonus: 0 }] });
    const [rapier, club] = attacks(c);
    expect(rapier.extras).toEqual([{ label: '+ Sneak Attack 3d6', formula: '1d8+3d6+3' }]);
    expect(club.extras).toEqual([]);
  });

  it('great weapon master is an optional extra on heavy weapons', () => {
    const c = make({ classes: [{ name: 'Fighter', level: 4, subclass: null }], baseScores: scores, feats: ['feat:great weapon master|xphb'], weapons: [{ key: 'g', itemId: 'item:greatsword|xphb', bonus: 0 }] });
    expect(attacks(c)[0]).toMatchObject({ damage: '2d6+3', extras: [{ formula: '2d6+5' }] });
  });

  it('domain and oath spells are always prepared and outside the limit', () => {
    const c = make({ classes: [{ name: 'Cleric', level: 5, subclass: 'Life' }] });
    const list = spells(c);
    expect(list.filter((s) => s.always).map((s) => s.name)).toEqual(expect.arrayContaining(['Bless', 'Cure Wounds', 'Revivify', 'Aid']));
    expect(list.every((s) => s.prepared)).toBe(true);
    const pal = spells(make({ classes: [{ name: 'Paladin', level: 2, subclass: null }] }));
    expect(pal.map((s) => s.name)).toEqual(['Divine Smite']);
  });
});

describe('class and species choices', () => {
  it('warlock invocations: count from the table, options gated by level', async () => {
    const { choiceSpecs } = await import('./choices');
    const spec = choiceSpecs(make({ classes: [{ name: 'Warlock', level: 5, subclass: null }] })).find((x) => x.key === 'Warlock:invocations')!;
    expect(spec.count).toBe(5);
    const names = spec.options.map((o) => o.label);
    expect(names).toContain('Agonizing Blast');
    expect(names).toContain('Ascendant Step');
    const low = choiceSpecs(make({ classes: [{ name: 'Warlock', level: 2, subclass: null }] })).find((x) => x.key === 'Warlock:invocations')!;
    expect(low.options.map((o) => o.label)).not.toContain('Ascendant Step');
  });

  it('fighting style, mastery and orders show up at the right levels', async () => {
    const { choiceSpecs } = await import('./choices');
    const keys = (cls: string, level: number) => choiceSpecs(make({ classes: [{ name: cls, level, subclass: null }] })).map((x) => `${x.key}:${x.count}`);
    expect(keys('Fighter', 1)).toEqual(['Fighter:fighting-style:1', 'Fighter:mastery:3']);
    expect(keys('Paladin', 1)).toEqual(['Paladin:mastery:2']);
    expect(keys('Paladin', 2)).toContain('Paladin:fighting-style:1');
    expect(keys('Sorcerer', 10)).toContain('Sorcerer:metamagic:4');
    expect(keys('Cleric', 1)).toContain('Cleric:divine-order:1');
  });

  it('picked choices take effect', () => {
    const scores = { str: 14, dex: 16, con: 14, int: 10, wis: 14, cha: 8 };
    const ranger = make({ classes: [{ name: 'Ranger', level: 2, subclass: null }], baseScores: scores, choices: { 'Ranger:fighting-style': ['feat:archery|xphb'] }, weapons: [{ key: 'b', itemId: 'item:longbow|xphb', bonus: 0 }] });
    expect(attacks(ranger)[0].toHit.value).toBe(3 + 2 + 2);
    const cleric = make({ classes: [{ name: 'Cleric', level: 1, subclass: null }], baseScores: scores, choices: { 'Cleric:divine-order': ['Protector'] }, weapons: [{ key: 'w', itemId: 'item:longsword|xphb', bonus: 0 }] });
    expect(attacks(cleric)[0].proficient).toBe(true);
    const thaum = derive(make({ classes: [{ name: 'Cleric', level: 1, subclass: null }], choices: { 'Cleric:divine-order': ['Thaumaturge'] } }));
    expect(thaum.spellcasting[0].cantrips).toBe(4);
    const human = derive(make({ speciesId: 'species:human|xphb', choices: { 'species:skills': ['stealth'] } }));
    expect(human.skills.find((x) => x.key === 'stealth')!.prof).toBe(1);
  });

  it('expertise allowance by class level', async () => {
    const { expertiseAllowed } = await import('./choices');
    expect(expertiseAllowed(make({ classes: [{ name: 'Rogue', level: 6, subclass: null }] })).count).toBe(4);
    expect(expertiseAllowed(make({ classes: [{ name: 'Bard', level: 1, subclass: null }] })).count).toBe(0);
  });
});
