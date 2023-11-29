// This line should be at the top of the webpacked output, so be sure to require createHandler first in any handlers.  "Soon" sourcemaps will be built into Node... after that, this package won't be needed.
require('source-map-support').install();

const { connectToDatabase } = require('@friggframework/database/mongo');
const { initDebugLog, flushDebugLog } = require('@friggframework/logs');

const createHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
        shouldUseDatabase = true,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event, context) => {
        try {
            initDebugLog(eventName, event);

            // Helps mongoose reuse the connection.  Lowers response times.
            context.callbackWaitsForEmptyEventLoop = false;

            if (shouldUseDatabase) {
                await connectToDatabase();
            }

            // Run the Lambda
            return await method(event, context);
        } catch (error) {
            flushDebugLog(error);

            // Don't leak implementation details to end users.
            if (isUserFacingResponse) {
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'An Internal Error Occurred',
                    }),
                };
            }

            // Handle server-to-server responses.

            // Halt errors are logged but suceed and won't be retried.
            if (error.isHaltError === true) {
                return;
            }

            // Here we can just rethrow and let AWS build the response.
            throw error;
        }
    };
};

module.exports = { createHandler };
