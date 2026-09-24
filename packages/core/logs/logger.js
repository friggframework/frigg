const { LEVELS, parseLevel } = require('./levels');
const { getLoggerScope } = require('./context');
const runtime = require('./logger-runtime');
const { buildRecord, DEFAULT_LOGGER_NAME } = require('./record');

const LOGGER_OWN_NAME = 'frigg.logger';

function copyBindings(bindings) {
    const copy = {};
    if (!bindings || typeof bindings !== 'object') return copy;
    for (const key of Object.keys(bindings)) {
        try {
            copy[key] = bindings[key];
        } catch {
            // A throwing getter drops only that binding.
        }
    }
    return copy;
}

function evaluateBindings(sources) {
    const merged = {};
    for (const source of sources) {
        let value = source;
        if (typeof source === 'function') {
            try {
                value = source();
            } catch {
                continue;
            }
        }
        Object.assign(merged, copyBindings(value));
    }
    return merged;
}

function isFriggViolation(record) {
    return (
        record.logger.startsWith('frigg.') &&
        LEVELS[record.level] >= LEVELS.WARN &&
        !record.eventName
    );
}

class Logger {
    constructor(name, bindingSources = []) {
        this.name = name;
        this._bindingSources = bindingSources;
    }

    trace(message, fields) {
        this._log('TRACE', message, fields);
    }

    debug(message, fields) {
        this._log('DEBUG', message, fields);
    }

    info(message, fields) {
        this._log('INFO', message, fields);
    }

    warn(message, fields) {
        this._log('WARN', message, fields);
    }

    error(message, fields) {
        this._log('ERROR', message, fields);
    }

    fatal(message, fields) {
        this._log('FATAL', message, fields);
    }

    child(bindings) {
        const source = typeof bindings === 'function' ? bindings : copyBindings(bindings);
        return new Logger(this.name, [...this._bindingSources, source]);
    }

    isLevelEnabled(level) {
        try {
            const name = parseLevel(level);
            return name !== null && LEVELS[name] >= runtime.getConfig().threshold;
        } catch {
            return false;
        }
    }

    _log(level, message, fields) {
        const state = runtime.state();
        if (state.inWrite) return;
        try {
            const config = runtime.getConfig();
            emitConfigWarnings();
            if (LEVELS[level] < config.threshold) return;

            const record = buildRecord({
                level,
                logger: this.name,
                message,
                fields,
                bindings: evaluateBindings(this._bindingSources),
                scope: getLoggerScope(),
                spanContext: runtime.getSpanContext(),
                resource: { appName: config.appName, stage: config.stage },
            });
            if (isFriggViolation(record)) {
                runtime.recordViolation({
                    logger: record.logger,
                    level: record.level,
                    message: record.message,
                });
            }
            writeToSinks(state, record);
        } catch {
            // The logger never throws.
        }
    }
}

function writeToSinks(state, record) {
    state.inWrite = true;
    try {
        for (const sink of runtime.getSinks()) {
            try {
                sink.write(record);
            } catch {
                // One failing sink must not stop the others.
            }
        }
    } finally {
        state.inWrite = false;
    }
}

function emitConfigWarnings() {
    const warnings = runtime.takeConfigWarnings();
    if (!warnings.length) return;
    const logger = getLogger(LOGGER_OWN_NAME);
    for (const warning of warnings) {
        logger.warn(warning.message, {
            ...warning.fields,
            eventName: warning.eventName,
        });
    }
}

const loggers = new Map();

function getLogger(name) {
    const key = typeof name === 'string' && name ? name : DEFAULT_LOGGER_NAME;
    if (!loggers.has(key)) loggers.set(key, new Logger(key));
    return loggers.get(key);
}

module.exports = { Logger, getLogger };
