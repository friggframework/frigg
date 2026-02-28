/**
 * Netlify Handler Factory
 *
 * Equivalent of packages/core/core/create-handler.js but for Netlify Functions.
 *
 * Key differences from Lambda createHandler:
 * - No AWS Secrets Manager fetch (Netlify env vars are already in process.env)
 * - No context.callbackWaitsForEmptyEventLoop (Lambda-specific)
 * - Preserves: debug logging, error handling, client-safe error pattern
 */
const { initDebugLog, flushDebugLog } = require('@friggframework/core/logs');

const createNetlifyHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event, context) => {
        try {
            initDebugLog(eventName, event);

            const requestMethod = event.httpMethod;
            const requestPath = event.path;
            if (requestMethod && requestPath) {
                console.info(`${requestMethod} ${requestPath}`);
            }

            // On Netlify, secrets are environment variables — no fetching needed.
            // (On AWS Lambda, createHandler calls secretsToEnv() here)

            return await method(event, context);
        } catch (error) {
            flushDebugLog(error);

            if (isUserFacingResponse) {
                if (error.isClientSafe === true) {
                    const statusCode = error.statusCode || 400;
                    return {
                        statusCode,
                        body: JSON.stringify({
                            error: error.message,
                        }),
                    };
                }

                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'An Internal Error Occurred',
                    }),
                };
            }

            if (error.isHaltError === true) {
                return;
            }

            throw error;
        }
    };
};

module.exports = { createNetlifyHandler };
