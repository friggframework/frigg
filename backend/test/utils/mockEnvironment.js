const originalEnv = process.env;

function mockEnvironment(overrideByKey) {
    process.env = { ...process.env, ...overrideByKey };
}

function restoreEnvironment() {
    process.env = originalEnv;
}

module.exports = { mockEnvironment, restoreEnvironment };
