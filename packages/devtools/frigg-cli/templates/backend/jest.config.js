module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.js', '**/test/**/*.spec.js'],
    testPathIgnorePatterns: ['/node_modules/'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/**/*.test.js',
        '!src/**/*.spec.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
    testTimeout: 30000,
    setupFilesAfterEnv: ['./test/setup.js'],
    // Jest groups for selective testing
    runner: 'groups',
};
