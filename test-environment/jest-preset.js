module.exports = {
    collectCoverage: true,
    testTimeout: 20_000,
    // TODO ? or not
    // globalSetup: './scripts/set-up-tests',
    // globalTeardown: './scripts/tear-down-tests',
    runner: 'groups',
    coverageReporters: ['text'],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80,
        },
    },
};
