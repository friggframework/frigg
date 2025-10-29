const { ProcessQueueService } = require('./process-queue-service');
const { ProcessUpdateMessage, ProcessUpdateOperation } = require('../domain/process-update-message');

// Mock the SQS client
jest.mock('@aws-sdk/client-sqs');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

describe('ProcessQueueService', () => {
    let service;
    let mockSQSClient;
    const testQueueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/process-management.fifo';

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create mock SQS client
        mockSQSClient = {
            send: jest.fn().mockResolvedValue({ MessageId: 'test-message-id' }),
        };
        SQSClient.mockImplementation(() => mockSQSClient);

        // Create service
        service = new ProcessQueueService({ queueUrl: testQueueUrl });
    });

    describe('constructor', () => {
        it('should create service with queueUrl', () => {
            expect(service.queueUrl).toBe(testQueueUrl);
            expect(service.sqsClient).toBeDefined();
        });

        it('should throw if queueUrl is missing', () => {
            expect(() => new ProcessQueueService({}))
                .toThrow('queueUrl is required');
        });

        it('should throw if queueUrl is not a string', () => {
            expect(() => new ProcessQueueService({ queueUrl: 123 }))
                .toThrow('queueUrl must be a string');
        });

        it('should use environment-based configuration in offline mode', () => {
            process.env.IS_OFFLINE = 'true';
            process.env.AWS_ENDPOINT = 'http://localhost:4566';

            new ProcessQueueService({ queueUrl: testQueueUrl });

            expect(SQSClient).toHaveBeenCalledWith(
                expect.objectContaining({
                    credentials: expect.objectContaining({
                        accessKeyId: 'test-aws-key',
                        secretAccessKey: 'test-aws-secret',
                    }),
                    region: 'us-east-1',
                    endpoint: 'http://localhost:4566',
                })
            );

            delete process.env.IS_OFFLINE;
            delete process.env.AWS_ENDPOINT;
        });
    });

    describe('sendMessage', () => {
        it('should send ProcessUpdateMessage to queue', async () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING' },
            });

            await service.sendMessage(message);

            expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
            const command = mockSQSClient.send.mock.calls[0][0];
            expect(command).toBeInstanceOf(SendMessageCommand);
            expect(command.input).toMatchObject({
                QueueUrl: testQueueUrl,
                MessageGroupId: 'process-proc-123',
            });

            const body = JSON.parse(command.input.MessageBody);
            expect(body.processId).toBe('proc-123');
            expect(body.operation).toBe('UPDATE_STATE');
        });

        it('should throw if message is not ProcessUpdateMessage', async () => {
            await expect(service.sendMessage({ invalid: 'message' }))
                .rejects.toThrow('message must be an instance of ProcessUpdateMessage');
        });

        it('should include MessageDeduplicationId for FIFO queue', async () => {
            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING' },
            });

            await service.sendMessage(message);

            const command = mockSQSClient.send.mock.calls[0][0];
            expect(command.input.MessageDeduplicationId).toBeDefined();
            expect(command.input.MessageDeduplicationId).toContain('proc-123');
            expect(command.input.MessageDeduplicationId).toContain('UPDATE_STATE');
        });

        it('should handle SQS send errors', async () => {
            mockSQSClient.send.mockRejectedValue(new Error('SQS error'));

            const message = new ProcessUpdateMessage({
                processId: 'proc-123',
                operation: ProcessUpdateOperation.UPDATE_STATE,
                data: { state: 'RUNNING' },
            });

            await expect(service.sendMessage(message))
                .rejects.toThrow('Failed to send message to queue: SQS error');
        });
    });

    describe('queueStateUpdate', () => {
        it('should queue state update message', async () => {
            await service.queueStateUpdate('proc-123', 'RUNNING', { step: 1 });

            expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.processId).toBe('proc-123');
            expect(body.operation).toBe('UPDATE_STATE');
            expect(body.data).toEqual({
                state: 'RUNNING',
                contextUpdates: { step: 1 },
            });
        });

        it('should queue state update without context updates', async () => {
            await service.queueStateUpdate('proc-123', 'RUNNING');

            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.data).toEqual({
                state: 'RUNNING',
                contextUpdates: {},
            });
        });

        it('should validate processId', async () => {
            await expect(service.queueStateUpdate('', 'RUNNING'))
                .rejects.toThrow();
        });

        it('should validate state', async () => {
            await expect(service.queueStateUpdate('proc-123', ''))
                .rejects.toThrow('state is required');
        });
    });

    describe('queueMetricsUpdate', () => {
        it('should queue metrics update message', async () => {
            const metricsUpdate = {
                totalProcessed: 100,
                totalFailed: 2,
            };

            await service.queueMetricsUpdate('proc-123', metricsUpdate);

            expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.processId).toBe('proc-123');
            expect(body.operation).toBe('UPDATE_METRICS');
            expect(body.data).toEqual({
                metricsUpdate,
            });
        });

        it('should validate processId', async () => {
            await expect(service.queueMetricsUpdate('', {}))
                .rejects.toThrow();
        });

        it('should validate metricsUpdate is an object', async () => {
            await expect(service.queueMetricsUpdate('proc-123', null))
                .rejects.toThrow('metricsUpdate is required');
        });
    });

    describe('queueProcessCompletion', () => {
        it('should queue process completion message', async () => {
            await service.queueProcessCompletion('proc-123');

            expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.processId).toBe('proc-123');
            expect(body.operation).toBe('COMPLETE_PROCESS');
            expect(body.data).toEqual({});
        });

        it('should validate processId', async () => {
            await expect(service.queueProcessCompletion(''))
                .rejects.toThrow();
        });
    });

    describe('queueErrorHandling', () => {
        it('should queue error handling message', async () => {
            const error = new Error('Test error');
            error.stack = 'Error stack trace';

            await service.queueErrorHandling('proc-123', error);

            expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.processId).toBe('proc-123');
            expect(body.operation).toBe('HANDLE_ERROR');
            expect(body.data).toEqual({
                error: {
                    message: 'Test error',
                    stack: 'Error stack trace',
                },
            });
        });

        it('should handle errors without stack trace', async () => {
            const error = new Error('Test error');
            delete error.stack;

            await service.queueErrorHandling('proc-123', error);

            const command = mockSQSClient.send.mock.calls[0][0];
            const body = JSON.parse(command.input.MessageBody);

            expect(body.data.error.message).toBe('Test error');
            expect(body.data.error.stack).toBeUndefined();
        });

        it('should validate processId', async () => {
            const error = new Error('Test error');
            await expect(service.queueErrorHandling('', error))
                .rejects.toThrow();
        });

        it('should validate error is an Error object', async () => {
            await expect(service.queueErrorHandling('proc-123', 'not an error'))
                .rejects.toThrow('error must be an Error object');
        });
    });

    describe('integration with different processes', () => {
        it('should use same MessageGroupId for same process', async () => {
            const processId = 'proc-same';

            await service.queueStateUpdate(processId, 'RUNNING');
            await service.queueMetricsUpdate(processId, { count: 1 });

            expect(mockSQSClient.send).toHaveBeenCalledTimes(2);

            const command1 = mockSQSClient.send.mock.calls[0][0];
            const command2 = mockSQSClient.send.mock.calls[1][0];

            expect(command1.input.MessageGroupId).toBe('process-proc-same');
            expect(command2.input.MessageGroupId).toBe('process-proc-same');
        });

        it('should use different MessageGroupId for different processes', async () => {
            await service.queueStateUpdate('proc-1', 'RUNNING');
            await service.queueStateUpdate('proc-2', 'RUNNING');

            const command1 = mockSQSClient.send.mock.calls[0][0];
            const command2 = mockSQSClient.send.mock.calls[1][0];

            expect(command1.input.MessageGroupId).toBe('process-proc-1');
            expect(command2.input.MessageGroupId).toBe('process-proc-2');
        });

        it('should use different MessageDeduplicationId for different operations', async () => {
            const processId = 'proc-123';

            await service.queueStateUpdate(processId, 'RUNNING');
            await service.queueMetricsUpdate(processId, { count: 1 });

            const command1 = mockSQSClient.send.mock.calls[0][0];
            const command2 = mockSQSClient.send.mock.calls[1][0];

            expect(command1.input.MessageDeduplicationId)
                .not.toBe(command2.input.MessageDeduplicationId);
        });
    });
});
