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

## Cloud sync (Supabase)

Optional: without it, characters live on the device only.

1. In the Supabase dashboard, open **SQL Editor**, paste `supabase/migrations/0001_characters.sql`, and run it.
2. Copy `.env.example` to `.env` and fill in the project URL and publishable (anon) key from **Project Settings → API**.
3. Restart `npx expo start`. Sign in from the avatar button next to the search bar.

Sync is local-first and last-write-wins per character; see `src/sync/merge.ts`.

## Try it on an iPhone (no Apple Developer account)

The app uses only native modules bundled in Expo Go (SDK 58), so no custom build is needed.

1. Install **Expo Go** from the App Store and sign in with the Expo account that belongs to `hagisas-team`.
2. In Expo Go, open **dnd-companion** under Projects and pick the latest update on branch `preview`.

Publish a new version with `npm run publish:ios -- --message "what changed"` (needs `EXPO_TOKEN`).
