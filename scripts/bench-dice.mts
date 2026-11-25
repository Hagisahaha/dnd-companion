/** Physics cost per throw. Run with `node --jitless` to approximate Hermes on a phone. */
import { simulateThrow } from '../src/dice/simulate.ts';
const run = (label: string, dice: Parameters<typeof simulateThrow>[0]['dice']) => {
  const t = performance.now();
  let frames = 0;
  for (let i = 0; i < 5; i++) frames += simulateThrow({ dice, velocity: [3, -30], bounds: [4.5, 7.5] }).frames;
  console.log(label.padEnd(10), ((performance.now() - t) / 5).toFixed(1).padStart(7), 'ms  frames', frames / 5);
};
run('1d20', [{ kind: 'd20', value: 7, start: [0, 3, 6] }]);
run('2d6+1d8', [{ kind: 'd6', value: 1, start: [-1, 3, 6] }, { kind: 'd6', value: 2, start: [1, 3, 6] }, { kind: 'd8', value: 3, start: [0, 3, 5] }]);
run('8d6', Array.from({ length: 8 }, (_, i) => ({ kind: 'd6' as const, value: 1, start: [-3 + i, 3, 6] as [number, number, number] })));
