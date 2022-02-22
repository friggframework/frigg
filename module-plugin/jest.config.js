module.exports = async () => {
    return {
        preset: '@friggframework/test-environment',
        coverageThreshold: {
            global: {
                branches: 0,
                functions: 10,
                lines: 22,
                statements: 22,
            },
        },
    };
};
