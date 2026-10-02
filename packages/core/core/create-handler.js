// This line should be at the top of the webpacked output, so be sure to require createHandler first in any handlers.  "Soon" sourcemaps will be built into Node... after that, this package won't be needed.
// REMOVING FOR NOW UNTIL WE ADD WEBPACK BACK IN
// require('source-map-support').install();

const { getLogger, toSanitizedSurrogate } = require('../logs');
const {
    summarizeLambdaEvent,
    toScopeInvocation,
    toRequestDetails,
} = require('../logs/summarize-event');
const {
    runInvocationScope,
    DEFAULT_FLUSH_TIMEOUT_MS,
} = require('./invocation-scope');
const { secretsToEnv } = require('./secrets-to-env');
const { parametersToEnv } = require('./parameters-to-env');
const {
    getTelemetry,
    getUsageRollupSubscriber,
    getPluginTelemetrySubscribers,
} = require('../telemetry/telemetry-runtime');

const log = getLogger('frigg.handler');

const createHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
        shouldUseDatabase = true,
        telemetry,
        flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
        usageRollup,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event, context) => {
        const eventSummary = summarizeLambdaEvent(event);
        const activeTelemetry = telemetry || getTelemetry();
        const activeUsageRollup =
            usageRollup !== undefined
                ? usageRollup
                : getUsageRollupSubscriber();

        // Wire adopter-declared telemetry subscribers once per cold start.
        // Memoized in the singleton, so this is a cheap
        // no-op after the first invocation.
        getPluginTelemetrySubscribers();

        const scopeFields = {
            requestId: context?.awsRequestId,
            handlerName: eventName,
            method: eventSummary.method,
            route: eventSummary.route,
            routeKey: eventSummary.routeKey,
            invocation: toScopeInvocation(eventSummary),
        };
        // Path, query keys and header names go only on the entry and failure
        // records; the logger adds them to the scope's invocation.
        const requestDetails = toRequestDetails(eventSummary);

        return runInvocationScope(
            scopeFields,
            async () => {
                try {
                    log.info('Handler invoked', {
                        eventName: 'frigg.handler.invoked',
                        invocation: requestDetails,
                    });

                    // If enabled (i.e. if SECRET_ARN is set in process.env) Fetch secrets from AWS Secrets Manager, and set them as environment variables.
                    await secretsToEnv();

                    // If enabled (i.e. if SSM_PARAMETER_PREFIX and FRIGG_SSM_OFFLOADED_KEYS are set) fetch offloaded params from SSM Parameter Store into process.env.
                    await parametersToEnv();

                    // Lazy-required so DB-free handlers never load the Prisma client.
                    if (shouldUseDatabase) {
                        const { connectPrisma } = require('../database/prisma');
                        await connectPrisma();
                    }

                    // Helps reuse the database connection.  Lowers response times.
                    context.callbackWaitsForEmptyEventLoop = false;

                    // Run the Lambda
                    return await method(event, context);
                } catch (error) {
                    // Allow client-safe errors to pass through with their actual message
                    if (isUserFacingResponse && error.isClientSafe === true) {
                        const statusCode = error.statusCode || 400;
                        log.warn('Request rejected', {
                            eventName: 'frigg.handler.rejected',
                            statusCode,
                            error,
                        });
                        return {
                            statusCode,
                            body: JSON.stringify({
                                error: error.message,
                            }),
                        };
                    }

                    // Server-to-server: halt errors succeed and won't be
                    // retried, so the halt itself is the failure record.
                    if (!isUserFacingResponse && error.isHaltError === true) {
                        log.error('Handler halted', {
                            eventName: 'frigg.handler.halted',
                            invocation: requestDetails,
                            error,
                        });
                        return;
                    }

                    log.error('Handler failed', {
                        eventName: 'frigg.handler.failed',
                        invocation: requestDetails,
                        error,
                    });

                    // Don't leak implementation details to end users.
                    if (isUserFacingResponse) {
                        return {
                            statusCode: 500,
                            body: JSON.stringify({
                                error: 'An Internal Error Occurred',
                            }),
                        };
                    }

                    // The Lambda runtime writes a rethrown error itself, so
                    // rethrow a sanitized copy (ADR-048 §6 item 11).
                    throw toSanitizedSurrogate(error);
                }
            },
            {
                telemetry: activeTelemetry,
                usageRollup: activeUsageRollup,
                eventSummary,
                shouldUseDatabase,
                flushTimeoutMs,
                context,
            }
        );
    };
};

module.exports = { createHandler };
