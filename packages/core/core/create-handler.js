// This line should be at the top of the webpacked output, so be sure to require createHandler first in any handlers.  "Soon" sourcemaps will be built into Node... after that, this package won't be needed.
// REMOVING FOR NOW UNTIL WE ADD WEBPACK BACK IN
// require('source-map-support').install();

const { initDebugLog, flushDebugLog } = require('../logs');
const { secretsToEnv } = require('./secrets-to-env');

// Best-effort extraction of correlation identifiers from a Lambda event.
// For SQS: pulls messageIds + parsed event/processId/integrationId from each
// record body. For HTTP: pulls method+path. Never throws.
const summarizeLambdaEvent = (event) => {
    if (!event) return {};
    if (Array.isArray(event.Records)) {
        return {
            source: 'sqs',
            records: event.Records.map((r) => {
                let parsed = {};
                try {
                    const body = JSON.parse(r.body);
                    parsed = {
                        event: body?.event,
                        processId: body?.data?.processId,
                        integrationId: body?.data?.integrationId,
                    };
                } catch {
                    // ignore unparseable bodies
                }
                return {
                    messageId: r.messageId,
                    receiveCount: r.attributes?.ApproximateReceiveCount,
                    ...parsed,
                };
            }),
        };
    }
    if (event.httpMethod || event.requestContext?.http) {
        return {
            source: 'http',
            method:
                event.httpMethod || event.requestContext?.http?.method,
            path: event.path || event.rawPath,
        };
    }
    return { source: 'other' };
};

const createHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event, context) => {
        const eventSummary = summarizeLambdaEvent(event);

        try {
            console.info(
                `[createHandler] ${eventName}: handler entry`,
                {
                    eventName,
                    awsRequestId: context?.awsRequestId,
                    ...eventSummary,
                }
            );

            initDebugLog(eventName, event);

            const requestMethod = event.httpMethod;
            const requestPath = event.path;
            if (requestMethod && requestPath) {
                console.info(`${requestMethod} ${requestPath}`);
            }

            // If enabled (i.e. if SECRET_ARN is set in process.env) Fetch secrets from AWS Secrets Manager, and set them as environment variables.
            await secretsToEnv();

            // Helps reuse the database connection.  Lowers response times.
            context.callbackWaitsForEmptyEventLoop = false;

            // Run the Lambda
            return await method(event, context);
        } catch (error) {
            flushDebugLog(error);

            // Don't leak implementation details to end users.
            if (isUserFacingResponse) {
                // Allow client-safe errors to pass through with their actual message
                if (error.isClientSafe === true) {
                    const statusCode = error.statusCode || 400;
                    return {
                        statusCode,
                        body: JSON.stringify({
                            error: error.message,
                        }),
                    };
                }

                // Hide other errors with generic message
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'An Internal Error Occurred',
                    }),
                };
            }

            // Handle server-to-server responses.

            // Halt errors are logged but suceed and won't be retried.
            // Log explicitly — silent suppression here previously made stuck
            // messages invisible to observability tooling. Include
            // eventSummary so operators can correlate across concurrent
            // invocations (processId / messageIds / HTTP path).
            if (error.isHaltError === true) {
                console.warn(
                    `[createHandler] ${eventName}: halt error suppressed (no retry)`,
                    {
                        eventName,
                        errorName: error.name,
                        errorMessage: error.message,
                        statusCode: error.statusCode,
                        ...eventSummary,
                    }
                );
                return;
            }

            // Here we can just rethrow and let AWS build the response.
            throw error;
        }
    };
};

module.exports = { createHandler };
