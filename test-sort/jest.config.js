module.exports = async () => {
    return {
        collectCoverage: true,
        coverageThreshold: {
            global: {
                branches: 100,
                functions: 100,
                lines: 100,
                statements: 100,
            },
        },
        testTimeout: 240_000, // 2 minutes
    };
};
