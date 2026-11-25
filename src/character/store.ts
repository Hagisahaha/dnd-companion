import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { migrate, newCharacter } from './engine';
import type { Character } from './types';

interface CharacterState {
  characters: Record<string, Character>;
  activeId: string | null;
  /** Deleted character ids and when, until the deletion has reached the server. */
  tombstones: Record<string, number>;
  /** Persisted state has loaded from disk. */
  hydrated: boolean;
  create: (c: Character) => void;
  update: (id: string, fn: (c: Character) => Character) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
  /** Applied by sync after merging with the server. */
  applySync: (characters: Record<string, Character>, tombstones: Record<string, number>) => void;
}

/**
 * Local-first character storage. Writes are immediate and survive app kills;
 * cloud sync (src/sync) runs behind it and never blocks a read or write.
 */
export const useCharacters = create<CharacterState>()(
  persist(
    (set) => ({
      characters: {},
      activeId: null,
      tombstones: {},
      hydrated: false,
      create: (c) => set((s) => ({ characters: { ...s.characters, [c.id]: c }, activeId: c.id })),
      update: (id, fn) =>
        set((s) => {
          const c = s.characters[id];
          return c ? { characters: { ...s.characters, [id]: { ...fn(c), updatedAt: Date.now() } } } : s;
        }),
      remove: (id) =>
        set((s) => {
          const { [id]: _, ...rest } = s.characters;
          return {
            characters: rest,
            tombstones: { ...s.tombstones, [id]: Date.now() },
            activeId: s.activeId === id ? Object.keys(rest)[0] ?? null : s.activeId,
          };
        }),
      setActive: (id) => set({ activeId: id }),
      applySync: (characters, tombstones) =>
        set((s) => ({
          characters: Object.fromEntries(Object.entries(characters).map(([k, v]) => [k, migrate(v)])),
          tombstones,
          activeId: s.activeId && characters[s.activeId] ? s.activeId : Object.keys(characters)[0] ?? null,
        })),
    }),
    {
      name: 'characters-v1',
      version: 2,
      migrate: (persisted) => {
        const p = persisted as { characters?: Record<string, Character>; activeId?: string | null };
        return { ...p, characters: Object.fromEntries(Object.entries(p.characters ?? {}).map(([k, v]) => [k, migrate(v)])) } as never;
      },
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ characters: s.characters, activeId: s.activeId, tombstones: s.tombstones }),
      onRehydrateStorage: () => () => useCharacters.setState({ hydrated: true }),
    },
  ),
);

export const useActiveCharacter = () => useCharacters((s) => (s.activeId ? s.characters[s.activeId] ?? null : null));

export function blankCharacter(): Character {
  return newCharacter(Crypto.randomUUID());
}
