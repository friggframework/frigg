/**
 * Deployed-runtime detection, provider-aware.
 *
 * "Deployed" decides whether a missing secret may be tolerated: a deployed
 * function must fail closed whatever STAGE says, while a laptop, a test run or
 * a local emulator may run in development mode. Reading only AWS Lambda's
 * variables (AWS_LAMBDA_FUNCTION_NAME, LAMBDA_TASK_ROOT, AWS_EXECUTION_ENV)
 * makes every other host look local: a Netlify Function with STAGE=dev would
 * be treated like `frigg start`.
 *
 * So the active provider is asked as well. The provider is the app
 * definition's `provider` or FRIGG_PROVIDER (which provider-netlify's
 * generated function entry points set to 'netlify'), resolved to its
 * @friggframework/provider-<name> package, and its `detect(env)` says whether
 * the process runs on that platform.
 *
 * A local run is never deployed: serverless-offline / `serverless invoke
 * local` (IS_OFFLINE, IS_LOCAL), `netlify dev` (NETLIFY_DEV=true) and Jest
 * (JEST_WORKER_ID).
 */
const { resolveProvider } = require('./resolve-provider');

function isSet(value) {
    return typeof value === 'string' && value.trim() !== '';
}

function isTrue(value) {
    if (typeof value !== 'string') return false;
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
}

/**
 * @param {Object} [env=process.env]
 * @returns {boolean} true under a local emulator or test runner
 */
function isLocalRun(env = process.env) {
    return (
        isTrue(env.IS_OFFLINE) ||
        isTrue(env.IS_LOCAL) ||
        isTrue(env.NETLIFY_DEV) ||
        isSet(env.JEST_WORKER_ID)
    );
}

/**
 * The AWS Lambda runtime sets AWS_LAMBDA_FUNCTION_NAME, LAMBDA_TASK_ROOT and
 * AWS_EXECUTION_ENV (AWS_Lambda_<runtime>).
 *
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
function isAwsLambdaRuntime(env = process.env) {
    return (
        isSet(env.AWS_LAMBDA_FUNCTION_NAME) ||
        isSet(env.LAMBDA_TASK_ROOT) ||
        String(env.AWS_EXECUTION_ENV ?? '').startsWith('AWS_Lambda_')
    );
}

/**
 * The provider plugin of the running app, or null for AWS (covered by
 * isAwsLambdaRuntime) or when no provider is named or its package is absent.
 *
 * @param {Object} [env=process.env]
 * @param {Object} [options]
 * @param {Object} [options.appDefinition]
 * @param {Function} [options.resolve=resolveProvider]
 * @returns {Object|null}
 */
function resolveActiveProvider(env = process.env, { appDefinition, resolve = resolveProvider } = {}) {
    const name = appDefinition?.provider || env.FRIGG_PROVIDER;
    if (!isSet(name) || name === 'aws') return null;
    try {
        return resolve(null, { provider: name });
    } catch (_) {
        return null;
    }
}

/**
 * True when the process runs as a deployed function on AWS Lambda or on the
 * active provider's platform, and not under a local emulator or test runner.
 *
 * @param {Object} [env=process.env]
 * @param {Object} [options]
 * @param {Object} [options.provider] - provider plugin to ask (default: the active one)
 * @param {Object} [options.appDefinition] - reads `provider`
 * @returns {boolean}
 */
function isDeployedRuntime(env = process.env, { provider, appDefinition } = {}) {
    if (isLocalRun(env)) return false;
    if (isAwsLambdaRuntime(env)) return true;
    if (provider === undefined) {
        // A named non-AWS provider whose package cannot be loaded (or has no
        // detect()) cannot say where we run. Fail closed: provider-netlify's
        // generated entry points set FRIGG_PROVIDER, so treating that as local
        // would let a deployed function accept unsigned queue messages.
        const name = appDefinition?.provider || env.FRIGG_PROVIDER;
        if (isSet(name) && name !== 'aws') {
            const active = resolveActiveProvider(env, { appDefinition });
            if (!active || typeof active.detect !== 'function') return true;
            return askProvider(active, env, true);
        }
        return false;
    }
    if (!provider || typeof provider.detect !== 'function') return false;
    return askProvider(provider, env, false);
}

function askProvider(active, env, onError) {
    try {
        return active.detect(env) === true;
    } catch (_) {
        return onError;
    }
}

module.exports = {
    isDeployedRuntime,
    isAwsLambdaRuntime,
    isLocalRun,
    resolveActiveProvider,
};
