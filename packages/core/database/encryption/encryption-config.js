/**
 * Field-level encryption configuration: decides whether sensitive fields are
 * encrypted, and with which key, from the process environment.
 *
 * The rule fails closed:
 *
 * - **Deployed** (running in AWS Lambda, and not under
 *   serverless-offline, `serverless invoke local` or Jest): the stage name is
 *   ignored. A configured key (KMS_KEY_ARN, or AES_KEY_ID with AES_KEY) turns
 *   encryption on. With no key, the configuration is an error and the Prisma
 *   client refuses to start, unless FRIGG_ENCRYPTION_DISABLED=true opts out
 *   explicitly.
 * - **Local** (`frigg start`, tests, scripts on a laptop): the stages dev,
 *   test and local skip encryption. Any other stage encrypts when a key is
 *   configured and stays plaintext, with a warning, when none is.
 *
 * Every module that encrypts or reports on encryption reads this one rule.
 */

const { logger } = require('./logger');

const LOCAL_BYPASS_STAGES = ['dev', 'test', 'local'];
const OPT_OUT_VAR = 'FRIGG_ENCRYPTION_DISABLED';

class EncryptionConfigurationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'EncryptionConfigurationError';
    }
}

function isSet(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isTrue(value) {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
}

/**
 * True when the process runs in AWS Lambda for real. The Lambda runtime sets
 * AWS_LAMBDA_FUNCTION_NAME, LAMBDA_TASK_ROOT and AWS_EXECUTION_ENV
 * (AWS_Lambda_<runtime>). serverless-offline sets the first two as well, so
 * IS_OFFLINE, IS_LOCAL and Jest mark a local run. Other AWS hosts (CloudShell,
 * CodeBuild, ECS) set AWS_EXECUTION_ENV to other values and count as local:
 * Frigg deploys its handlers to Lambda only, and CLI commands run from CI must
 * not trip the deployed-stage check.
 *
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
function isDeployedRuntime(env = process.env) {
    const onAwsRuntime =
        isSet(env.AWS_LAMBDA_FUNCTION_NAME) ||
        isSet(env.LAMBDA_TASK_ROOT) ||
        String(env.AWS_EXECUTION_ENV ?? '').startsWith('AWS_Lambda_');
    if (!onAwsRuntime) return false;

    const localRun =
        isTrue(env.IS_OFFLINE) ||
        isTrue(env.IS_LOCAL) ||
        isSet(env.JEST_WORKER_ID);
    return !localRun;
}

function missingKeyMessage(stage) {
    return (
        `[Frigg] No field-level encryption key is configured for stage "${stage}". ` +
        'A deployed Frigg app will not write credentials and other sensitive fields in plaintext. ' +
        "Fix: set encryption: { fieldLevelEncryptionMethod: 'kms' } in the app definition and redeploy " +
        '(Frigg creates or discovers a KMS key and sets KMS_KEY_ARN), ' +
        'or provide AES_KEY_ID and AES_KEY (32 characters) in the Lambda environment. ' +
        `To run this stage without encryption on purpose, set ${OPT_OUT_VAR}=true ` +
        "(or encryption: { fieldLevelEncryptionMethod: 'none' } in the app definition)."
    );
}

function incompleteAesMessage(stage) {
    return (
        `[Frigg] AES_KEY_ID is set but AES_KEY is not (stage "${stage}"). ` +
        'Provide AES_KEY (32 characters) alongside AES_KEY_ID, ' +
        "or use KMS with encryption: { fieldLevelEncryptionMethod: 'kms' }."
    );
}

/**
 * Resolves the encryption configuration without side effects.
 *
 * @param {Object} [env=process.env]
 * @returns {{
 *   enabled: boolean,
 *   method: 'kms'|'aes'|undefined,
 *   mode: 'kms'|'aes'|'none',
 *   runtime: 'deployed'|'local',
 *   stage: string,
 *   bypassed: boolean,
 *   optedOut: boolean,
 *   optOutIgnored: boolean,
 *   hasKMS: boolean,
 *   hasAES: boolean,
 *   error: string|null,
 * }} `error` is set when a deployed runtime has no usable key.
 */
function resolveEncryptionConfig(env = process.env) {
    const stage = env.STAGE || env.NODE_ENV || 'development';
    const runtime = isDeployedRuntime(env) ? 'deployed' : 'local';
    const hasKMS = isSet(env.KMS_KEY_ARN);
    const hasAES = isSet(env.AES_KEY_ID);
    const optOutRequested = isTrue(env[OPT_OUT_VAR]);

    const base = {
        enabled: false,
        method: undefined,
        mode: 'none',
        runtime,
        stage,
        bypassed: false,
        optedOut: false,
        optOutIgnored: false,
        hasKMS,
        hasAES,
        error: null,
    };

    if (runtime === 'local') {
        if (LOCAL_BYPASS_STAGES.includes(String(stage).toLowerCase())) {
            return { ...base, bypassed: true };
        }
        if (hasKMS || hasAES) {
            const method = hasKMS ? 'kms' : 'aes';
            return { ...base, enabled: true, method, mode: method };
        }
        return base;
    }

    const hasCompleteAES = hasAES && isSet(env.AES_KEY);
    if (hasKMS || hasCompleteAES) {
        const method = hasKMS ? 'kms' : 'aes';
        return {
            ...base,
            enabled: true,
            method,
            mode: method,
            optOutIgnored: optOutRequested,
        };
    }

    if (optOutRequested) {
        return { ...base, optedOut: true };
    }

    return {
        ...base,
        error: hasAES ? incompleteAesMessage(stage) : missingKeyMessage(stage),
    };
}

const warned = new Set();

function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    logger.warn(message);
}

/**
 * Resolves the encryption configuration for use: throws when a deployed
 * runtime has no usable key, and warns once per process (once per Lambda
 * cold start) when encryption is explicitly disabled.
 *
 * @param {Object} [env=process.env]
 * @returns {ReturnType<typeof resolveEncryptionConfig>}
 * @throws {EncryptionConfigurationError}
 */
function getEncryptionConfig(env = process.env) {
    const config = resolveEncryptionConfig(env);

    if (config.error) {
        throw new EncryptionConfigurationError(config.error);
    }

    if (config.optedOut) {
        warnOnce(
            'opted-out',
            `[Frigg] ${OPT_OUT_VAR}=true: field-level encryption is OFF for stage "${config.stage}". ` +
                'Credentials and other sensitive fields are stored in PLAINTEXT. ' +
                `Remove ${OPT_OUT_VAR} and configure a key (fieldLevelEncryptionMethod: 'kms') to encrypt them.`
        );
    }

    if (config.optOutIgnored) {
        warnOnce(
            'opt-out-ignored',
            `[Frigg] ${OPT_OUT_VAR}=true is ignored because an encryption key is configured; ` +
                `fields are encrypted with ${config.method.toUpperCase()}. ` +
                'Turning encryption off while a key is present would leave encrypted data unreadable.'
        );
    }

    if (config.runtime === 'local' && !config.enabled && !config.bypassed) {
        warnOnce(
            'local-no-keys',
            `No encryption keys configured (KMS_KEY_ARN or AES_KEY_ID) for local stage "${config.stage}". ` +
                'Field-level encryption disabled for this local run. ' +
                'A deployed stage without a key refuses to start.'
        );
    }

    return config;
}

/** Test helper: let the once-per-process warnings fire again. */
function resetEncryptionConfigWarnings() {
    warned.clear();
}

module.exports = {
    EncryptionConfigurationError,
    LOCAL_BYPASS_STAGES,
    OPT_OUT_VAR,
    getEncryptionConfig,
    isDeployedRuntime,
    resetEncryptionConfigWarnings,
    resolveEncryptionConfig,
};
