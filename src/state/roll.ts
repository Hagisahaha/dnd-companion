import { create } from 'zustand';
import type { RollMode } from '../dice/roll';

/**
 * Advantage/disadvantage for the next roll, shared by the tray and the sheet.
 * It resets after each roll: in play, advantage is per roll, and a sticky toggle
 * silently skews later rolls.
 */
export const useRollMode = create<{ mode: RollMode; set: (m: RollMode) => void; consume: () => RollMode }>((set, get) => ({
  mode: 'normal',
  set: (mode) => set({ mode }),
  consume: () => {
    const m = get().mode;
    if (m !== 'normal') set({ mode: 'normal' });
    return m;
  },
}));
