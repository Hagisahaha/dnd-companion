# D&D Companion

Minimal, gesture-first companion app for a single D&D 5e (2024) character: 3D dice, live combat tracking, rules lookup.

Design brief (source of truth): [docs/DESIGN.md](docs/DESIGN.md)

## Dev

```bash
npm install
npx expo start
```

## Layout

- `src/app/`: screens (Expo Router)
- `src/dice/`: dice engine, pure TS and unit-tested (`npm test`): notation, RNG, polyhedra, physics, forced-result orientation
- `src/components/dice/`: 3D tray (react-three-fiber) and controls
- `src/compendium/`, `src/data/compendium/`: rules lookup, built from 5etools by `npm run data:fetch && npm run data:build`
- `scripts/gen-dice-atlas.mts`: regenerates `assets/dice/atlas.png` (`npm run gen:atlas`) after changing die geometry or labels

Native builds need a development build (`npx expo run:ios` / `run:android` or EAS), not Expo Go.
