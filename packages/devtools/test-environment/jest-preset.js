module.exports = {
    collectCoverage: true,
    testTimeout: 20_000,
    runner: 'groups',
    coverageReporters: ['text'],
    coverageThreshold: {
        global: {
            statements: 80,
            branches: 80,
            functions: 80,
            lines: 80,
        },
    },
};
