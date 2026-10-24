/**
 * Netlify Handler Factory
 *
 * Netlify Functions (v1, `exports.handler = async (event, context)`) receive
 * a Lambda-shaped event, so a Netlify function runs on core's createHandler
 * itself rather than on a copy of it (friggframework/frigg#545 had a copy).
 * That keeps every behaviour of an AWS handler on Netlify: the invocation
 * scope and structured logging, telemetry, the client-safe error contract,
 * sanitised rethrows, and the database connection when shouldUseDatabase.
 *
 * The AWS-only steps inside createHandler are env-gated no-ops on Netlify:
 * secretsToEnv() runs only with SECRET_ARN, parametersToEnv() only with
 * SSM_PARAMETER_PREFIX + FRIGG_SSM_OFFLOADED_KEYS, and
 * context.callbackWaitsForEmptyEventLoop is a plain property assignment.
 */
const { createHandler } = require('@friggframework/core/core/create-handler');

/**
 * @param {Object} optionByName - same options as core's createHandler
 *   ({ eventName, method, isUserFacingResponse, shouldUseDatabase, ... }).
 */
const createNetlifyHandler = (optionByName = {}) => {
    if (!optionByName.method) {
        throw new Error('Method is required for handler.');
    }
    return createHandler(optionByName);
};

module.exports = { createNetlifyHandler };
