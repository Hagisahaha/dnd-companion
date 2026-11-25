import { describe, expect, it } from 'vitest';
import { newCharacter } from '../character/engine';
import type { Character } from '../character/types';
import { merge, RemoteRow } from './merge';

const ch = (id: string, updatedAt: number, name = id): Character => ({ ...newCharacter(id), name, updatedAt });
const row = (c: Character, deleted = false): RemoteRow => ({ id: c.id, data: c, updated_ms: c.updatedAt, deleted });

describe('sync merge', () => {
  it('uploads characters the server has never seen', () => {
    const r = merge({ a: ch('a', 1) }, {}, []);
    expect(r.push.map((p) => p.id)).toEqual(['a']);
  });

  it('downloads characters made on another device', () => {
    const r = merge({}, {}, [row(ch('b', 5, 'Remote'))]);
    expect(r.characters.b.name).toBe('Remote');
    expect(r.push).toEqual([]);
  });

  it('newest edit wins in both directions', () => {
    const r1 = merge({ a: ch('a', 10, 'Local') }, {}, [row(ch('a', 5, 'Old'))]);
    expect(r1.characters.a.name).toBe('Local');
    expect(r1.push[0].data.name).toBe('Local');
    const r2 = merge({ a: ch('a', 5, 'Old') }, {}, [row(ch('a', 10, 'Remote'))]);
    expect(r2.characters.a.name).toBe('Remote');
    expect(r2.push).toEqual([]);
  });

  it('equal timestamps are left alone', () => {
    const r = merge({ a: ch('a', 7) }, {}, [row(ch('a', 7))]);
    expect(r.push).toEqual([]);
  });

  it('a local deletion becomes a server tombstone', () => {
    const r = merge({}, { a: 20 }, [row(ch('a', 10))]);
    expect(r.push).toEqual([expect.objectContaining({ id: 'a', deleted: true, updated_ms: 20 })]);
    expect(r.tombstones).toEqual({});
    expect(r.characters.a).toBeUndefined();
  });

  it('an edit made elsewhere after a local deletion brings the character back', () => {
    const r = merge({}, { a: 10 }, [row(ch('a', 20, 'Kept'))]);
    expect(r.characters.a.name).toBe('Kept');
    expect(r.push).toEqual([]);
  });

  it('a deletion from another device removes the local copy unless edited since', () => {
    expect(merge({ a: ch('a', 5) }, {}, [row(ch('a', 10), true)]).characters.a).toBeUndefined();
    const kept = merge({ a: ch('a', 15) }, {}, [row(ch('a', 10), true)]);
    expect(kept.characters.a).toBeDefined();
    expect(kept.push[0]).toMatchObject({ id: 'a', deleted: false });
  });

  it('forgets tombstones for characters the server never had', () => {
    expect(merge({}, { x: 3 }, []).tombstones).toEqual({});
  });
});
