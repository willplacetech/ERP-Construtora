console.log('Jest config loaded');
export default {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.(js|mjs)$': '$1',
  },
  transform: {
    '^.+\\.(js|mjs)$': 'babel-jest',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[tj]s?(x)',
    '**/?(*.)+(spec|test).mjs'
  ],
};