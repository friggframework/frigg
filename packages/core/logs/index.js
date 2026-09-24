const { getLogger } = require('./logger');
const { createMemorySink } = require('./sinks');
const { resetLoggerForTests } = require('./logger-runtime');
const { serializeError, toSanitizedSurrogate } = require('./serialize');
const { redactValue } = require('./redact');
const { debug, initDebugLog, flushDebugLog } = require('./debug-shims');

module.exports = {
    getLogger,
    createMemorySink,
    resetLoggerForTests,
    serializeError,
    redactValue,
    toSanitizedSurrogate,
    debug,
    initDebugLog,
    flushDebugLog,
};
