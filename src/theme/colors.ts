import { useColorScheme } from 'react-native';

/** iOS system palette (HIG). One source for both modes; no custom brand colors. */
const light = {
  background: '#F2F2F7',
  surface: '#FFFFFF',
  fill: 'rgba(120,120,128,0.12)',
  fillStrong: 'rgba(120,120,128,0.24)',
  tray: '#E5E5EA',
  label: '#000000',
  secondaryLabel: 'rgba(60,60,67,0.6)',
  tertiaryLabel: 'rgba(60,60,67,0.3)',
  separator: 'rgba(60,60,67,0.29)',
  accent: '#007AFF',
  green: '#34C759',
  orange: '#FF9500',
  red: '#FF3B30',
  onAccent: '#FFFFFF',
};

const dark: typeof light = {
  background: '#000000',
  surface: '#1C1C1E',
  fill: 'rgba(120,120,128,0.24)',
  fillStrong: 'rgba(120,120,128,0.36)',
  tray: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: 'rgba(235,235,245,0.6)',
  tertiaryLabel: 'rgba(235,235,245,0.3)',
  separator: 'rgba(84,84,88,0.65)',
  accent: '#0A84FF',
  green: '#30D158',
  orange: '#FF9F0A',
  red: '#FF453A',
  onAccent: '#FFFFFF',
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === 'light' ? light : dark;
}
