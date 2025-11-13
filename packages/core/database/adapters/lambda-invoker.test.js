/**
 * Tests for LambdaInvoker
 * Infrastructure layer - AWS Lambda invocation adapter
 */

const { LambdaInvoker, LambdaInvocationError } = require('./lambda-invoker');

/**
 * @group unit
 * @group infrastructure
 */
describe('LambdaInvoker', () => {
    let invoker;
    let mockLambdaClient;

    beforeEach(() => {
        mockLambdaClient = {
            send: jest.fn(),
        };
        invoker = new LambdaInvoker(mockLambdaClient);
    });

    describe('invoke()', () => {
        it('should invoke Lambda and return parsed result on success', async () => {
            mockLambdaClient.send.mockResolvedValue({
                Payload: Buffer.from(JSON.stringify({
                    statusCode: 200,
                    body: { upToDate: true, pendingMigrations: 0 },
                })),
            });

            const result = await invoker.invoke('test-function', { action: 'checkStatus' });

            expect(result).toEqual({ upToDate: true, pendingMigrations: 0 });
            expect(mockLambdaClient.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    input: expect.objectContaining({
                        FunctionName: 'test-function',
                        InvocationType: 'RequestResponse',
                        Payload: JSON.stringify({ action: 'checkStatus' }),
                    }),
                })
            );
        });

        it('should throw LambdaInvocationError on Lambda error status', async () => {
            mockLambdaClient.send.mockResolvedValue({
                Payload: Buffer.from(JSON.stringify({
                    statusCode: 500,
                    body: { error: 'Database connection failed' },
                })),
            });

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow(LambdaInvocationError);

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow(/test-function/);

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow(/Database connection failed/);
        });

        it('should throw LambdaInvocationError on malformed response', async () => {
            mockLambdaClient.send.mockResolvedValue({
                Payload: Buffer.from('not json'),
            });

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow(LambdaInvocationError);

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow(/Failed to parse/);
        });

        it('should handle AWS SDK errors', async () => {
            mockLambdaClient.send.mockRejectedValue(new Error('AccessDenied: User not authorized'));

            await expect(invoker.invoke('test-function', {}))
                .rejects
                .toThrow('Failed to invoke Lambda test-function: AccessDenied: User not authorized');
        });

        it('should include function name in LambdaInvocationError', async () => {
            mockLambdaClient.send.mockResolvedValue({
                Payload: Buffer.from(JSON.stringify({
                    statusCode: 500,
                    body: { error: 'Test error' },
                })),
            });

            try {
                await invoker.invoke('my-function-name', {});
                fail('Should have thrown');
            } catch (error) {
                expect(error).toBeInstanceOf(LambdaInvocationError);
                expect(error.functionName).toBe('my-function-name');
                expect(error.statusCode).toBe(500);
                expect(error.message).toContain('my-function-name');
            }
        });
    });
});


