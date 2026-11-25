import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface Settings {
  /** Leave rolled dice on the tray (showing their numbers) and add new throws to them. */
  keepDice: boolean;
  setKeepDice: (v: boolean) => void;
}

export const useSettings = create<Settings>()(
  persist((set) => ({ keepDice: false, setKeepDice: (keepDice) => set({ keepDice }) }), {
    name: 'settings-v1',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (s) => ({ keepDice: s.keepDice }),
  }),
);
