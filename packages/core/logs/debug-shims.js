const util = require('node:util');
const { getLogger } = require('./logger');
const { getContext } = require('./context');
const {
    summarizeLambdaEvent,
    toRequestInvocation,
} = require('./summarize-event');

// Deprecated. Kept for one major version; use getLogger or this.logger.
const LEGACY_LOGGER_NAME = 'frigg.legacy';
const FORMAT_DIRECTIVE = /%[sdifjoOc%]/;

const legacy = () => getLogger(LEGACY_LOGGER_NAME);

function debug(...messages) {
    if (!messages.length) return;
    const log = legacy();
    if (!log.isLevelEnabled('DEBUG')) return;
    const index = messages.findIndex((m) => typeof m === 'string');
    if (index === 0 && FORMAT_DIRECTIVE.test(messages[0])) {
        log.debug(util.format(...messages));
        return;
    }
    const message = index === -1 ? '' : messages[index];
    const args = messages.filter((_, i) => i !== index);
    log.debug(message, args.length ? { args } : undefined);
}

function initDebugLog(...initMessages) {
    if (getContext()?.log) return;
    const log = legacy();
    if (!log.isLevelEnabled('DEBUG')) return;
    const event = initMessages.find((m) => m && typeof m === 'object');
    log.debug('Debug log initialized', {
        invocation: toRequestInvocation(summarizeLambdaEvent(event)),
    });
}

function flushDebugLog(error) {
    legacy().error('Unhandled error', {
        eventName: 'frigg.legacy.error',
        error: error || new Error('flushDebugLog called with empty error'),
    });
}

module.exports = { debug, initDebugLog, flushDebugLog };
