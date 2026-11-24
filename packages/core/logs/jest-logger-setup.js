const { createMemorySink } = require('./sinks');
const { resetLoggerForTests, takeViolationsForTests } = require('./logger-runtime');
const { toContainNoSecretWindow } = require('./__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

const resetToMemory = () =>
    resetLoggerForTests({
        level: 'TRACE',
        sinks: [createMemorySink({ install: false })],
        trackViolations: true,
    });

// Also at load: records written at require time must not reach fd 1.
resetToMemory();

beforeEach(resetToMemory);

afterEach(() => {
    const violations = takeViolationsForTests();
    if (violations.length) {
        const list = violations.map((v) => `${v.level} ${v.logger}: ${v.message}`).join('\n');
        throw new Error(`frigg.* records at WARN or above need an eventName:\n${list}`);
    }
});
