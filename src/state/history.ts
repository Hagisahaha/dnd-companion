import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { formatFormula, parseFormula } from '../dice/notation';
import type { RollResult } from '../dice/roll';

export interface HistoryEntry {
  id: string;
  at: number;
  label: string | null;
  formula: string;
  mode: RollResult['mode'];
  dice: { sides: number; value: number; dropped: boolean; sign: 1 | -1; rerolls: number }[];
  modifier: number;
  total: number;
  crit: RollResult['crit'];
  /** Who rolled, so a shared phone at the table stays readable. */
  character: string | null;
}

export interface Preset {
  id: string;
  name: string;
  formula: string;
}

const MAX = 200;

interface RollLog {
  history: HistoryEntry[];
  presets: Preset[];
  record: (r: RollResult, label?: string | null, character?: string | null) => void;
  /** Replace an entry after a single-die reroll, keeping its place in the log. */
  replace: (r: RollResult) => void;
  clear: () => void;
  savePreset: (p: Omit<Preset, 'id'> & { id?: string }) => void;
  removePreset: (id: string) => void;
}

const toEntry = (r: RollResult, label: string | null, character: string | null): HistoryEntry => ({
  id: r.id,
  at: r.at,
  label,
  formula: formatFormula(r.formula),
  mode: r.mode,
  dice: r.dice.map((d) => ({ sides: d.sides, value: d.value, dropped: d.dropped, sign: d.sign, rerolls: d.rerolls })),
  modifier: r.formula.modifier,
  total: r.total,
  crit: r.crit,
  character,
});

export const useRollLog = create<RollLog>()(
  persist(
    (set) => ({
      history: [],
      presets: [
        { id: 'p-check', name: 'Check', formula: '1d20' },
        { id: 'p-4d6', name: 'Stat roll', formula: '4d6' },
      ],
      record: (r, label = null, character = null) => set((s) => ({ history: [toEntry(r, label, character), ...s.history].slice(0, MAX) })),
      replace: (r) => set((s) => ({ history: s.history.map((h) => (h.id === r.id ? { ...toEntry(r, h.label, h.character) } : h)) })),
      clear: () => set({ history: [] }),
      savePreset: (p) =>
        set((s) => {
          if (!parseFormula(p.formula)) return s;
          const id = p.id ?? `p${Date.now().toString(36)}`;
          const next = { id, name: p.name.trim() || p.formula, formula: p.formula.trim() };
          return { presets: s.presets.some((x) => x.id === id) ? s.presets.map((x) => (x.id === id ? next : x)) : [...s.presets, next] };
        }),
      removePreset: (id) => set((s) => ({ presets: s.presets.filter((x) => x.id !== id) })),
    }),
    { name: 'roll-log-v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
