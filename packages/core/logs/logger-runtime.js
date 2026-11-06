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
            inLog: false,
            trackViolations: false,
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
    await Promise.allSettled(
        getSinks()
            .filter((sink) => typeof sink.flush === 'function')
            .map(async (sink) => sink.flush({ signal }))
    );
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

// Off in production, so a warm container never grows this list.
function recordViolation(violation) {
    const s = state();
    if (s.trackViolations) s.violations.push(violation);
}

function takeViolationsForTests() {
    return state().violations.splice(0);
}

function resetLoggerForTests({ level, sinks, trackViolations } = {}) {
    const s = state();
    s.config = null;
    s.levelOverride = parseLevel(level);
    setSinks(sinks);
    s.spanContextProvider = null;
    s.warned.clear();
    s.violations.length = 0;
    s.inLog = false;
    if (typeof trackViolations === 'boolean') s.trackViolations = trackViolations;
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
