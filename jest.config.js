/** @type {import('jest').Config} */
// Dedicated Jest config for Firestore rules tests. Runs only against
// `tests/firestore-rules/` so it doesn't pick up any RN/Expo tests.
//
// Pre-req for `npm run test:rules`: the Firestore emulator must be running.
// We point it via FIRESTORE_EMULATOR_HOST in the test setup file.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/firestore-rules/**/*.test.ts'],
  setupFilesAfterEach: [],
  testTimeout: 15000,
};
