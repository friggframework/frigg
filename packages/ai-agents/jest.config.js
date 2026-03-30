module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/tests/**/*.test.js'],
    collectCoverageFrom: ['src/**/*.js'],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    verbose: true
};
