/**
 * Boots the real app under the iOS jest preset, to catch startup errors that
 * only happen on native (the web build can't see them).
 */
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

test('root layout loads and home renders on iOS', async () => {
  const errors: unknown[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a); orig(...a); };
  // Load each route module directly first: a throw here is the real startup error.
  for (const p of ['../src/app/_layout', '../src/app/index']) {
    try {
      const m = require(p);
      expect(m).toBeTruthy();
    } catch (e) {
      throw new Error(`Loading ${p} failed: ${(e as Error).stack}`);
    }
  }
  renderRouter('./src/app', { initialUrl: '/' });
  expect(await screen.findByText('Search spells, items, rules')).toBeTruthy();
});
