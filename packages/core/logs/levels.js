const LEVELS = Object.freeze({
    TRACE: 10,
    DEBUG: 20,
    INFO: 30,
    WARN: 40,
    ERROR: 50,
    FATAL: 60,
});

const LEVEL_NAMES = Object.freeze(Object.keys(LEVELS));
const DEFAULT_LEVEL = 'INFO';
const MAX_ECHO_LENGTH = 32;

function parseLevel(value) {
    if (typeof value !== 'string') return null;
    const name = value.trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(LEVELS, name) ? name : null;
}

function isSet(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isLocalRun(env) {
    if (env.STAGE === 'local') return true;
    const offline = String(env.IS_OFFLINE ?? '').trim().toLowerCase();
    return offline === 'true' || offline === '1';
}

function lessVerbose(a, b) {
    return LEVELS[a] >= LEVELS[b] ? a : b;
}

function resolveLevel(env = {}) {
    const warnings = [];
    let level;

    if (isSet(env.FRIGG_LOG_LEVEL)) {
        level = parseLevel(env.FRIGG_LOG_LEVEL);
        if (!level) {
            level = DEFAULT_LEVEL;
            warnings.push({
                eventName: 'frigg.logger.invalid_level',
                message: 'Unknown FRIGG_LOG_LEVEL, using INFO',
                fields: {
                    received: env.FRIGG_LOG_LEVEL.trim().slice(0, MAX_ECHO_LENGTH),
                    allowed: LEVEL_NAMES,
                },
            });
        }
    } else if (env.DEBUG_VERBOSE === '1' || isLocalRun(env)) {
        level = 'DEBUG';
    } else {
        level = DEFAULT_LEVEL;
    }

    const awsLevel = parseLevel(env.AWS_LAMBDA_LOG_LEVEL);
    if (awsLevel && awsLevel !== level) {
        const effective = lessVerbose(level, awsLevel);
        warnings.push({
            eventName: 'frigg.logger.level_conflict',
            message: 'FRIGG_LOG_LEVEL and AWS_LAMBDA_LOG_LEVEL differ, using the less verbose level',
            fields: { friggLevel: level, awsLevel, effectiveLevel: effective },
        });
        level = effective;
    }

    return { level, warnings };
}

module.exports = { LEVELS, LEVEL_NAMES, DEFAULT_LEVEL, parseLevel, resolveLevel };
