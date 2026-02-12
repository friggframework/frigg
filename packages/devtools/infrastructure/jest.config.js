module.exports = {
  displayName: 'Infrastructure',
  rootDir: __dirname,
  testMatch: [
    '<rootDir>/**/*.test.js',
    '<rootDir>/**/*.spec.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/fixtures/',
    '/__tests__/helpers/',
  ],
  testEnvironment: 'node',
  testTimeout: 10000,
  transform: {},
};
