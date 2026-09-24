const LOG_LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

// CloudWatch Logs PutRetentionPolicy values. The osls schema copy lacks 1096.
const RETENTION_DAYS = [
    1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827,
    2192, 2557, 2922, 3288, 3653,
];

// First osls version that compiles provider.logs.lambda into LoggingConfig.
const LOGGING_CONFIG_FRAMEWORK_VERSION = '>=3.58.0';

// ADR-048 Open question 3 (Phase 0 spike). Set to false to leave Lambda on
// its default Text format; FRIGG_LOG_LEVEL then filters in process alone.
const EMIT_LAMBDA_JSON_LOGGING_CONFIG = true;

function normalizeLogLevel(level) {
    const normalized = typeof level === 'string' ? level.toUpperCase() : level;
    if (!LOG_LEVELS.includes(normalized)) {
        throw new Error(
            `Invalid logging.level ${JSON.stringify(level)}. Use one of: ${LOG_LEVELS.join(', ')} (any case).`
        );
    }
    return normalized;
}

function validateRetentionInDays(retentionInDays) {
    if (!RETENTION_DAYS.includes(retentionInDays)) {
        throw new Error(
            `Invalid logging.retentionInDays ${JSON.stringify(retentionInDays)}. CloudWatch accepts: ${RETENTION_DAYS.join(', ')}.`
        );
    }
    return retentionInDays;
}

/**
 * Map appDefinition.logging to provider-level serverless settings.
 * Returns an empty object when logging is absent (ADR-048 §12: no change).
 *
 * @param {Object} [logging] - appDefinition.logging
 * @returns {{ frameworkVersion?: string, provider?: Object }}
 */
function buildLoggingProviderConfig(logging) {
    if (!logging) return {};

    const provider = {};
    const result = {};

    if (logging.level !== undefined) {
        const level = normalizeLogLevel(logging.level);
        result.frameworkVersion = LOGGING_CONFIG_FRAMEWORK_VERSION;
        if (EMIT_LAMBDA_JSON_LOGGING_CONFIG) {
            provider.logs = {
                lambda: {
                    logFormat: 'JSON',
                    applicationLogLevel: level,
                    systemLogLevel: 'INFO',
                },
            };
        }
    }

    if (logging.retentionInDays !== undefined) {
        provider.logRetentionInDays = validateRetentionInDays(
            logging.retentionInDays
        );
    }

    if (Object.keys(provider).length > 0) result.provider = provider;
    return result;
}

module.exports = {
    LOG_LEVELS,
    RETENTION_DAYS,
    normalizeLogLevel,
    buildLoggingProviderConfig,
};
