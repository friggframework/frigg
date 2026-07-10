/**
 * SSM Offload Utilities
 *
 * Shared helpers for the SSM Parameter Store offload feature. A variable is
 * "offloaded" when its value lives in Parameter Store and is fetched by the
 * runtime at cold start instead of being baked into the Lambda environment
 * (which counts against the hard 4KB env-var limit).
 *
 * Consumed by the SsmBuilder, the environment builder, and the
 * `frigg ssm push` CLI command so they all agree on the offload key set and
 * parameter naming.
 */

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;

const DEFAULT_PARAMETER_PREFIX =
    '/frigg/${self:service}/${self:provider.stage}';

// Keys the framework itself sets (from discovered resources or the base
// template) or that the loader/bypass handlers depend on before SSM values
// are available. Never offloadable.
const FRAMEWORK_ENV_BLOCKLIST = new Set([
    'STAGE',
    'FRIGG_STACK',
    'FRIGG_STAGE',
    'FRIGG_REGION',
    'KMS_KEY_ARN',
    'AES_KEY',
    'AES_KEY_ID',
    'DATABASE_URL',
    'DATABASE_HOST',
    'DATABASE_PORT',
    'DATABASE_USER',
    'DATABASE_PASSWORD',
    'DATABASE_SECRET_ARN',
    'DB_TYPE',
    'MONGO_URI',
    'SECRET_ARN',
    'SSM_PARAMETER_PREFIX',
    'FRIGG_SSM_OFFLOADED_KEYS',
    'FRIGG_SSM_CACHE_TTL',
    'WORKER_FUNCTION_NAME',
    // Reserved AWS Lambda runtime variables
    '_HANDLER',
    '_X_AMZN_TRACE_ID',
    'AWS_DEFAULT_REGION',
    'AWS_EXECUTION_ENV',
    'AWS_REGION',
    'AWS_LAMBDA_FUNCTION_NAME',
    'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
    'AWS_LAMBDA_FUNCTION_VERSION',
    'AWS_LAMBDA_INITIALIZATION_TYPE',
    'AWS_LAMBDA_LOG_GROUP_NAME',
    'AWS_LAMBDA_LOG_STREAM_NAME',
    'AWS_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
]);

/**
 * Union of keys marked for SSM offload, sorted for deterministic output.
 * Sources: appDefinition.environment values === 'ssm' and
 * appDefinition.ssm.parameters keys. Does NOT filter invalid/blocklisted
 * keys — use validateOffloadConfig() to surface those as errors instead of
 * silently dropping them.
 *
 * @param {Object} appDefinition
 * @returns {string[]}
 */
function getOffloadedKeys(appDefinition = {}) {
    const keys = new Set();

    for (const [key, value] of Object.entries(
        appDefinition.environment || {}
    )) {
        if (value === 'ssm') keys.add(key);
    }

    for (const key of Object.keys(appDefinition.ssm?.parameters || {})) {
        keys.add(key);
    }

    return [...keys].sort();
}

/**
 * Parameter path prefix under which offloaded values are stored. The default
 * uses serverless variables resolved at package time and stays inside the
 * *frigg* scope of the generated deployment IAM policies.
 *
 * @param {Object} appDefinition
 * @returns {string}
 */
function getParameterPrefix(appDefinition = {}) {
    const prefix =
        appDefinition.ssm?.parameterPrefix || DEFAULT_PARAMETER_PREFIX;
    return prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
}

/**
 * Whether the offload feature is active for this build: SSM enabled, at
 * least one key marked, and not running in local mode.
 *
 * @param {Object} appDefinition
 * @returns {boolean}
 */
function isSsmOffloadActive(appDefinition = {}) {
    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') return false;
    if (appDefinition.ssm?.enable !== true) return false;
    return getOffloadedKeys(appDefinition).length > 0;
}

/**
 * Validate the offload configuration. Returns errors (not warnings) for
 * misconfigurations that would silently lose variables at runtime.
 *
 * @param {Object} appDefinition
 * @returns {{errors: string[]}}
 */
function validateOffloadConfig(appDefinition = {}) {
    const errors = [];
    const offloadedKeys = getOffloadedKeys(appDefinition);

    if (offloadedKeys.length === 0) {
        return { errors };
    }

    if (appDefinition.ssm?.enable !== true) {
        errors.push(
            `Environment keys are marked for SSM offload (${offloadedKeys.join(
                ', '
            )}) but ssm.enable is not true. Set ssm: { enable: true } in the app definition.`
        );
    }

    for (const key of offloadedKeys) {
        if (FRAMEWORK_ENV_BLOCKLIST.has(key)) {
            errors.push(
                `${key} is a framework-managed environment variable and cannot be offloaded to SSM.`
            );
        } else if (!ENV_NAME_PATTERN.test(key)) {
            errors.push(
                `'${key}' is not a valid environment variable name (expected ${ENV_NAME_PATTERN}); it cannot be offloaded to SSM.`
            );
        }
    }

    return { errors };
}

module.exports = {
    getOffloadedKeys,
    getParameterPrefix,
    isSsmOffloadActive,
    validateOffloadConfig,
    FRAMEWORK_ENV_BLOCKLIST,
    DEFAULT_PARAMETER_PREFIX,
};
