module.exports = {
    displayName: 'e2e',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.js'],
    testTimeout: 30000,
    setupFilesAfterEnv: ['<rootDir>/__tests__/helpers/setup.js'],
    collectCoverageFrom: [
        'test-app/**/*.js',
        '!**/__tests__/**',
    ],
};
