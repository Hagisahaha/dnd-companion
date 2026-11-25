// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'data-raw/*', 'src/data/*'],
  },
  {
    // react-three-fiber elements (<mesh>, <directionalLight>…) take three.js props React doesn't know.
    files: ['src/components/dice/DiceScene.tsx', 'src/components/dice/DiceTray.tsx', 'src/components/QuickRoll.tsx'],
    rules: { 'react/no-unknown-property': 'off' },
  },
]);
