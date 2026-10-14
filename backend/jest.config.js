export default {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': 'babel-jest',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};