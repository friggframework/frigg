import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

export class LambdaInvocationError extends Error {
    functionName: string;
    statusCode: number | null;

    constructor(message: string, functionName: string, statusCode: number | null) {
        super(message);
        this.name = 'LambdaInvocationError';
        this.functionName = functionName;
        this.statusCode = statusCode;
    }
}

export class LambdaInvoker {
    private client: LambdaClient;

    constructor(lambdaClient: LambdaClient = new LambdaClient({})) {
        this.client = lambdaClient;
    }

    async invoke(functionName: string, payload: Record<string, unknown>): Promise<unknown> {
        try {
            const command = new InvokeCommand({
                FunctionName: functionName,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify(payload),
            });

            const response = await this.client.send(command);

            let result: Record<string, unknown>;
            try {
                result = JSON.parse(Buffer.from(response.Payload!).toString());
            } catch (parseError) {
                throw new LambdaInvocationError(
                    `Failed to parse Lambda response: ${(parseError as Error).message}`,
                    functionName,
                    null
                );
            }

            if (result.statusCode === 200) {
                return result.body;
            }

            const errorMessage = (result.body as Record<string, unknown>)?.error || 'Lambda invocation failed';
            throw new LambdaInvocationError(
                `Lambda ${functionName} returned error: ${errorMessage}`,
                functionName,
                result.statusCode as number
            );
        } catch (error) {
            if (error instanceof LambdaInvocationError) {
                throw error;
            }

            throw new Error(`Failed to invoke Lambda ${functionName}: ${(error as Error).message}`);
        }
    }
}
