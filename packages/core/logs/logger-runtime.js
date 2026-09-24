const { LEVELS, parseLevel, resolveLevel } = require('./levels');

// On globalThis so jest.resetModules and nested core copies share one state.
const STATE_KEY = Symbol.for('@friggframework/core.logs');

function state() {
    if (!globalThis[STATE_KEY]) {
        globalThis[STATE_KEY] = {
            config: null,
            levelOverride: null,
            sinks: null,
            spanContextProvider: null,
            warned: new Set(),
            inWrite: false,
            violations: [],
        };
    }
    return globalThis[STATE_KEY];
}

function readEnv(name) {
    const value = process.env[name];
    return typeof value === 'string' && value !== '' ? value : undefined;
}

function getConfig() {
    const s = state();
    if (!s.config) {
        const resolved = s.levelOverride
            ? { level: s.levelOverride, warnings: [] }
            : resolveLevel(process.env);
        s.config = {
            level: resolved.level,
            threshold: LEVELS[resolved.level],
            appName: readEnv('FRIGG_STACK'),
            stage: readEnv('STAGE'),
            pendingWarnings: resolved.warnings,
        };
    }
    return s.config;
}

function takeConfigWarnings() {
    const s = state();
    const config = getConfig();
    const pending = config.pendingWarnings.splice(0);
    return pending.filter((warning) => {
        if (s.warned.has(warning.eventName)) return false;
        s.warned.add(warning.eventName);
        return true;
    });
}

function getSinks() {
    const s = state();
    if (!s.sinks) {
        s.sinks = [require('./sinks').createStdoutSink()];
    }
    return s.sinks;
}

function setSinks(sinks) {
    state().sinks = Array.isArray(sinks) ? [...sinks] : null;
}

function hasFlushableSinks() {
    return getSinks().some((sink) => typeof sink.flush === 'function');
}

async function flushSinks({ signal } = {}) {
    const flushes = getSinks()
        .filter((sink) => typeof sink.flush === 'function')
        .map((sink) => {
            try {
                return Promise.resolve(sink.flush({ signal }));
            } catch (error) {
                return Promise.reject(error);
            }
        });
    await Promise.allSettled(flushes);
}

function setSpanContextProvider(provider) {
    state().spanContextProvider = typeof provider === 'function' ? provider : null;
}

function getSpanContextProvider() {
    return state().spanContextProvider;
}

function getSpanContext() {
    const provider = state().spanContextProvider;
    if (!provider) return null;
    try {
        const ctx = provider();
        if (ctx && typeof ctx.traceId === 'string' && typeof ctx.spanId === 'string') {
            return ctx;
        }
    } catch {
        // A broken provider must not break logging.
    }
    return null;
}

function recordViolation(violation) {
    state().violations.push(violation);
}

function takeViolationsForTests() {
    return state().violations.splice(0);
}

function resetLoggerForTests({ level, sinks } = {}) {
    const s = state();
    s.config = null;
    s.levelOverride = parseLevel(level);
    s.sinks = Array.isArray(sinks) ? [...sinks] : [require('./sinks').createStdoutSink()];
    s.spanContextProvider = null;
    s.warned.clear();
    s.violations.length = 0;
    s.inWrite = false;
}

module.exports = {
    state,
    getConfig,
    takeConfigWarnings,
    getSinks,
    setSinks,
    hasFlushableSinks,
    flushSinks,
    setSpanContextProvider,
    getSpanContextProvider,
    getSpanContext,
    recordViolation,
    takeViolationsForTests,
    resetLoggerForTests,
};
