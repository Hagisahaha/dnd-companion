import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { newCharacter } from './engine';
import type { Character } from './types';

interface CharacterState {
  characters: Record<string, Character>;
  activeId: string | null;
  /** Draft being built in the editor; committed on save. */
  hydrated: boolean;
  create: (c: Character) => void;
  update: (id: string, fn: (c: Character) => Character) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
}

/**
 * Local-first character storage. Writes are immediate and survive app kills;
 * cloud sync (Supabase) will sit behind this store, not in front of it.
 */
export const useCharacters = create<CharacterState>()(
  persist(
    (set) => ({
      characters: {},
      activeId: null,
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
          return { characters: rest, activeId: s.activeId === id ? Object.keys(rest)[0] ?? null : s.activeId };
        }),
      setActive: (id) => set({ activeId: id }),
    }),
    {
      name: 'characters-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ characters: s.characters, activeId: s.activeId }),
      onRehydrateStorage: () => () => useCharacters.setState({ hydrated: true }),
    },
  ),
);

export const useActiveCharacter = () => useCharacters((s) => (s.activeId ? s.characters[s.activeId] ?? null : null));

export function blankCharacter(): Character {
  return newCharacter(Crypto.randomUUID());
}
