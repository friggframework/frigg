import { initDebugLog, flushDebugLog } from '../logs';
import { secretsToEnv } from './secrets-to-env';

export interface LambdaEvent {
    httpMethod?: string;
    path?: string;
    [key: string]: unknown;
}

export interface LambdaContext {
    callbackWaitsForEmptyEventLoop?: boolean;
    [key: string]: unknown;
}

export interface LambdaResponse {
    statusCode: number;
    body: string;
    [key: string]: unknown;
}

export type HandlerMethod = (
    event: LambdaEvent,
    context: LambdaContext
) => Promise<LambdaResponse | void>;

export interface CreateHandlerOptions {
    eventName?: string;
    isUserFacingResponse?: boolean;
    method: HandlerMethod;
    shouldUseDatabase?: boolean;
}

export const createHandler = (
    optionByName: CreateHandlerOptions
): ((event: LambdaEvent, context: LambdaContext) => Promise<LambdaResponse | void>) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event: LambdaEvent, context: LambdaContext) => {
        try {
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
        } catch (error: unknown) {
            flushDebugLog(error as Error);

            const err = error as Record<string, unknown>;

            // Don't leak implementation details to end users.
            if (isUserFacingResponse) {
                // Allow client-safe errors to pass through with their actual message
                if (err.isClientSafe === true) {
                    const statusCode = (err.statusCode as number) || 400;
                    return {
                        statusCode,
                        body: JSON.stringify({
                            error: (error as Error).message,
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

            // Halt errors are logged but succeed and won't be retried.
            if (err.isHaltError === true) {
                return;
            }

            // Here we can just rethrow and let AWS build the response.
            throw error;
        }
    };
};

