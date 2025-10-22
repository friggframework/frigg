/**
 * Lambda Invoker Adapter
 * Infrastructure layer - handles AWS Lambda function invocations
 * 
 * Part of Hexagonal Architecture:
 * - Infrastructure Layer adapter for AWS SDK
 * - Used by Domain Layer use cases
 * - Isolates AWS-specific logic from business logic
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

/**
 * Custom error for Lambda invocation failures
 * Provides structured error information for debugging
 */
class LambdaInvocationError extends Error {
    constructor(message, functionName, statusCode) {
        super(message);
        this.name = 'LambdaInvocationError';
        this.functionName = functionName;
        this.statusCode = statusCode;
    }
}

/**
 * Adapter for invoking AWS Lambda functions
 * 
 * Infrastructure layer - handles AWS SDK communication
 * Converts AWS SDK responses to domain-friendly formats
 */
class LambdaInvoker {
    /**
     * @param {LambdaClient} lambdaClient - AWS Lambda client (injected for testability)
     */
    constructor(lambdaClient = new LambdaClient({})) {
        this.client = lambdaClient;
    }

    /**
     * Invoke Lambda function synchronously
     * 
     * @param {string} functionName - Lambda function name or ARN
     * @param {Object} payload - Event payload to send to Lambda
     * @returns {Promise<Object>} Parsed response body
     * @throws {LambdaInvocationError} If Lambda returns error status
     * @throws {Error} If AWS SDK call fails
     */
    async invoke(functionName, payload) {
        try {
            const command = new InvokeCommand({
                FunctionName: functionName,
                InvocationType: 'RequestResponse', // Synchronous
                Payload: JSON.stringify(payload),
            });

            const response = await this.client.send(command);

            // Parse response payload
            let result;
            try {
                result = JSON.parse(Buffer.from(response.Payload).toString());
            } catch (parseError) {
                throw new LambdaInvocationError(
                    `Failed to parse Lambda response: ${parseError.message}`,
                    functionName,
                    null
                );
            }

            // Check status code
            if (result.statusCode === 200) {
                return result.body;
            }

            // Lambda returned error status
            const errorMessage = result.body?.error || 'Lambda invocation failed';
            throw new LambdaInvocationError(
                `Lambda ${functionName} returned error: ${errorMessage}`,
                functionName,
                result.statusCode
            );
        } catch (error) {
            // Re-throw LambdaInvocationError as-is
            if (error instanceof LambdaInvocationError) {
                throw error;
            }

            // Wrap AWS SDK errors
            throw new Error(`Failed to invoke Lambda ${functionName}: ${error.message}`);
        }
    }
}

module.exports = { LambdaInvoker, LambdaInvocationError };

