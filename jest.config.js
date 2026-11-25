module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['<rootDir>/__native_tests__/**/*.test.ts?(x)'],
  // Many deps ship ESM only; transform node_modules too (slower, but this suite is a single boot test).
  transformIgnorePatterns: ['node_modules/(?!.*)/'],
  // Metro resolves the "react-native" field, so the device runs fiber's native build; make jest do the same.
  moduleNameMapper: {
    '^@react-three/fiber$': '<rootDir>/node_modules/@react-three/fiber/native/dist/react-three-fiber-native.cjs.js',
  },
};
