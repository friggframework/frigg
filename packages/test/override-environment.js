const originalEnv = process.env;

function overrideEnvironment(overrideByKey) {
    process.env = { ...process.env, ...overrideByKey };
}

function restoreEnvironment() {
    process.env = originalEnv;
}

module.exports = { overrideEnvironment, restoreEnvironment };
