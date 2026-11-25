import { describe, expect, it } from 'vitest';
import { getEntry } from '../compendium/store';
import { applyDamage, applyHealing, applyTempHp, derive, longRest, newCharacter, shortRest } from './engine';
import { RULES } from './rules';
import type { Character } from './types';

function make(p: Partial<Character>): Character {
  return { ...newCharacter('t'), ...p };
}

describe('derive: core numbers', () => {
  const wiz = make({
    name: 'Vex',
    classes: [{ name: 'Wizard', level: 5, subclass: 'Evoker' }],
    speciesId: 'species:elf|xphb',
    backgroundId: 'background:sage|xphb',
    baseScores: { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 },
    backgroundBonus: { int: 2, con: 1 },
    otherBonus: { int: 1 }, // ASI at 4
    skills: { arcana: 1, history: 1, investigation: 2 },
  });
  const d = derive(wiz);

  it('scores, modifiers and proficiency bonus', () => {
    expect(d.scores.int.value).toBe(18);
    expect(d.scores.int.parts.map((p) => p.label)).toEqual(['Base', 'Background', 'Other bonuses']);
    expect(d.mods.int).toBe(4);
    expect(d.pb).toBe(3);
  });

  it('class saves come from the starting class', () => {
    expect(d.saves.int).toMatchObject({ value: 7, proficient: true });
    expect(d.saves.wis).toMatchObject({ value: 4, proficient: true });
    expect(d.saves.str).toMatchObject({ value: -1, proficient: false });
  });

  it('skills with proficiency and expertise', () => {
    const s = (k: string) => d.skills.find((x) => x.key === k)!.stat.value;
    expect(s('arcana')).toBe(7);
    expect(s('investigation')).toBe(10);
    expect(s('athletics')).toBe(-1);
    expect(d.passivePerception.value).toBe(11);
  });

  it('wizard 5 spellcasting matches the PHB table', () => {
    expect(d.spellcasting[0]).toMatchObject({ ability: 'int', cantrips: 4, prepared: 9 });
    expect(d.spellcasting[0].dc.value).toBe(15);
    expect(d.spellcasting[0].attack.value).toBe(7);
    expect(d.slots.map((s) => s.max)).toEqual([4, 3, 2]);
  });

  it('hit points: max die at level 1, average after, CON every level', () => {
    // d6: 6 + 4×4 = 22, CON 14 → +2 × 5 = 10
    expect(d.maxHp.value).toBe(32);
    expect(d.hitDice).toEqual([{ faces: 6, total: 5, used: 0 }]);
  });

  it('lists features up to the current level, including the subclass', () => {
    const names = d.features.map((f) => f.name);
    expect(names).toContain('Arcane Recovery');
    expect(names).toContain('Memorize Spell');
    expect(names).not.toContain('Spell Mastery');
    expect(d.features.some((f) => f.source.includes('Evoker'))).toBe(true);
  });

  it('every listed feature links to a compendium entry', () => {
    for (const cls of RULES.classes) {
      const c = derive(make({ classes: [{ name: cls.name, level: 20, subclass: cls.subclasses.find((s) => s.source === 'XPHB')?.shortName ?? null }] }));
      for (const f of c.features) expect(f.id && getEntry(f.id), `${cls.name}: ${f.name}`).toBeTruthy();
      for (const r of c.resources) expect(r.featureId && getEntry(r.featureId), `${cls.name}: ${r.name}`).toBeTruthy();
    }
  });
});

describe('derive: armor class and speed', () => {
  const base = { baseScores: { str: 15, dex: 14, con: 16, int: 8, wis: 14, cha: 10 } };

  it('barbarian unarmored defense and fast movement', () => {
    const d = derive(make({ ...base, classes: [{ name: 'Barbarian', level: 5, subclass: 'Berserker' }], shield: true }));
    expect(d.ac.value).toBe(10 + 2 + 3 + 2);
    expect(d.speed.value).toBe(40);
    expect(d.resources.find((r) => r.key === 'rage')).toMatchObject({ max: 3, shortRest: 1 });
  });

  it('monk unarmored defense and movement', () => {
    const d = derive(make({ ...base, classes: [{ name: 'Monk', level: 6, subclass: null }] }));
    expect(d.ac.value).toBe(10 + 2 + 2);
    expect(d.speed.value).toBe(30 + 15);
    expect(d.resources.find((r) => r.key === 'focus')?.max).toBe(6);
  });

  it('medium armor caps DEX at +2, heavy ignores it', () => {
    const dex18 = { ...base.baseScores, dex: 18 };
    expect(derive(make({ baseScores: dex18, armorId: 'item:breastplate|xphb' })).ac.value).toBe(16);
    expect(derive(make({ baseScores: dex18, armorId: 'item:plate armor|xphb', shield: true })).ac.value).toBe(20);
  });

  it('heavy armor without the STR requirement slows you down', () => {
    const d = derive(make({ baseScores: { ...base.baseScores, str: 13 }, armorId: 'item:plate armor|xphb' }));
    expect(d.speed.value).toBe(20);
    expect(d.warnings.some((w) => w.includes('STR 15'))).toBe(true);
  });

  it('overrides win and say so', () => {
    const d = derive(make({ ...base, overrides: { ac: 21 } }));
    expect(d.ac).toMatchObject({ value: 21, overridden: true });
  });
});

describe('derive: multiclass spell slots', () => {
  it('paladin 3 / sorcerer 3 uses caster level 5 (half rounds up)', () => {
    const d = derive(make({ classes: [{ name: 'Paladin', level: 3, subclass: null }, { name: 'Sorcerer', level: 3, subclass: null }] }));
    expect(d.slots.map((s) => s.max)).toEqual([4, 3, 2]);
    expect(d.spellcasting.map((s) => s.className)).toEqual(['Paladin', 'Sorcerer']);
    // Saves come only from the first class: Paladin = WIS, CHA.
    expect(d.saves.wis.proficient && d.saves.cha.proficient && !d.saves.con.proficient).toBe(true);
  });

  it('single-class paladin uses its own table', () => {
    expect(derive(make({ classes: [{ name: 'Paladin', level: 1, subclass: null }] })).slots.map((s) => s.max)).toEqual([2]);
  });

  it('warlock pact magic is separate from slots', () => {
    const d = derive(make({ classes: [{ name: 'Warlock', level: 5, subclass: null }] }));
    expect(d.slots).toEqual([]);
    expect(d.pact).toMatchObject({ max: 2, level: 3 });
  });

  it('eldritch knight 7 is a third caster with 4/2 slots', () => {
    const d = derive(make({ classes: [{ name: 'Fighter', level: 7, subclass: 'Eldritch Knight' }] }));
    expect(d.slots.map((s) => s.max)).toEqual([4, 2]);
    expect(d.spellcasting[0].ability).toBe('int');
  });
});

describe('hit points and rests', () => {
  const fighter = () => make({ classes: [{ name: 'Fighter', level: 3, subclass: null }], baseScores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 }, hp: { current: 28, temp: 0 } });

  it('temp HP absorb damage first and do not stack', () => {
    let c = applyTempHp(fighter(), 5);
    c = applyTempHp(c, 3);
    expect(c.hp.temp).toBe(5);
    c = applyDamage(c, 8).character;
    expect(c.hp).toEqual({ current: 25, temp: 0 });
  });

  it('concentration save DC is half the damage, min 10, max 30', () => {
    const c = { ...fighter(), concentration: 'Bless' };
    expect(applyDamage(c, 7).concentrationDc).toBe(10);
    expect(applyDamage(c, 27).concentrationDc).toBe(13);
    expect(applyDamage(fighter(), 27).concentrationDc).toBeNull();
  });

  it('damage at 0 HP fails a death save; massive damage kills', () => {
    const down = applyDamage(fighter(), 28).character;
    expect(down.hp.current).toBe(0);
    expect(applyDamage(down, 3).character.deathSaves.fail).toBe(1);
    expect(applyDamage(fighter(), 28 + 28).instantDeath).toBe(true);
    expect(applyHealing(applyDamage(down, 3).character, 4)).toMatchObject({ hp: { current: 4 }, deathSaves: { success: 0, fail: 0 } });
  });

  it('short rest restores per-feature, long rest restores everything', () => {
    let c = { ...fighter(), resourcesUsed: { secondwind: 2, actionsurge: 1 }, slotsUsed: [1], exhaustion: 2, hp: { current: 5, temp: 2 } };
    c = shortRest(c);
    expect(c.resourcesUsed).toEqual({ secondwind: 1, actionsurge: 0 });
    c = longRest(c);
    expect(c.resourcesUsed).toEqual({});
    expect(c.hp).toEqual({ current: 28, temp: 0 });
    expect(c.exhaustion).toBe(1);
  });
});
