module.exports = async () => {
    return {
        preset: '@friggframework/test-environment',
        coverageThreshold: {
            global: {
                statements: 13,
                branches: 0,
                functions: 1,
                lines: 13,
            },
        },
    };
};
