const { createMemorySink } = require('../sinks');
const { resetLoggerForTests } = require('../logger-runtime');

function applyEnv(vars) {
    const saved = {};
    for (const [key, value] of Object.entries(vars)) {
        saved[key] = Object.prototype.hasOwnProperty.call(process.env, key)
            ? process.env[key]
            : undefined;
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
    return () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

// Sets env keys (undefined deletes), resets the logger to read them, and
// passes a fresh memory sink to fn. Restores env and the test logger after.
function withEnv(vars, fn) {
    const restore = applyEnv(vars);
    const sink = createMemorySink({ install: false });
    resetLoggerForTests({ sinks: [sink] });
    const done = () => {
        restore();
        resetLoggerForTests({ level: 'TRACE', sinks: [createMemorySink({ install: false })] });
    };
    let result;
    try {
        result = fn(sink);
    } catch (error) {
        done();
        throw error;
    }
    if (result && typeof result.then === 'function') {
        return result.finally(done);
    }
    done();
    return result;
}

module.exports = { withEnv, applyEnv };
