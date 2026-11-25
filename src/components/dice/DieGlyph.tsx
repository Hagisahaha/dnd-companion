import Svg, { Polygon, Polyline } from 'react-native-svg';
import type { DieSides } from '../../dice/notation';

const P: Record<DieSides, { outline: string; inner?: string[] }> = {
  4: { outline: '12,2 22,20 2,20', inner: [] },
  6: { outline: '4,4 20,4 20,20 4,20' },
  8: { outline: '12,2 21,12 12,22 3,12', inner: ['3,12 21,12'] },
  10: { outline: '12,2 21,10 12,22 3,10', inner: ['3,10 12,14 21,10', '12,14 12,22'] },
  12: { outline: '12,2 21.5,8.9 17.9,20 6.1,20 2.5,8.9', inner: ['12,7 16.5,10.3 14.8,15.5 9.2,15.5 7.5,10.3 12,7'] },
  20: { outline: '12,2 21,7 21,17 12,22 3,17 3,7', inner: ['12,6 18.5,16 5.5,16 12,6', '12,2 12,6', '21,17 18.5,16', '3,17 5.5,16'] },
  100: { outline: '7,3 13,8 7,21 1,8', inner: ['17,3 23,8 17,21 11,8'] },
};

export function DieGlyph({ sides, size = 24, color }: { sides: DieSides; size?: number; color: string }) {
  const g = P[sides];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Polygon points={g.outline} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      {g.inner?.map((pts) => (
        <Polyline key={pts} points={pts} fill="none" stroke={color} strokeWidth={1.1} strokeLinejoin="round" opacity={0.7} />
      ))}
    </Svg>
  );
}
