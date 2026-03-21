/**
 * Tests for Worker - Provider-Agnostic Queue Interface
 *
 * Tests Worker operations using a mock QueueClientInterface.
 * No AWS SDK dependency — the queue client is injected via constructor.
 */

const { Worker } = require('./Worker');

describe('Worker', () => {
    let mockQueueClient;
    let worker;

    beforeEach(() => {
        mockQueueClient = {
            sendMessage: jest.fn().mockResolvedValue({
                MessageId: 'message-123',
            }),
            sendMessageBatch: jest.fn().mockResolvedValue({
                Successful: [],
                Failed: [],
            }),
            getQueueUrl: jest.fn().mockResolvedValue(
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            ),
        };

        worker = new Worker({ queueClient: mockQueueClient });
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should throw if no queueClient is provided when queue methods are used', async () => {
            const workerNoClient = new Worker();

            await expect(
                workerNoClient.getQueueURL({ QueueName: 'test' })
            ).rejects.toThrow('Worker requires a queueClient');
        });

        it('should accept a queueClient via options', () => {
            const w = new Worker({ queueClient: mockQueueClient });
            expect(w).toBeDefined();
        });
    });

    describe('getQueueURL()', () => {
        it('should get queue URL via queue client', async () => {
            const result = await worker.getQueueURL({
                QueueName: 'test-queue',
            });

            expect(result).toBe(
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            );
            expect(mockQueueClient.getQueueUrl).toHaveBeenCalledWith({
                QueueName: 'test-queue',
            });
        });

        it('should handle queue not found error', async () => {
            mockQueueClient.getQueueUrl.mockRejectedValue(
                new Error('Queue does not exist')
            );

            await expect(
                worker.getQueueURL({ QueueName: 'nonexistent-queue' })
            ).rejects.toThrow('Queue does not exist');
        });
    });

    describe('sendAsyncSQSMessage()', () => {
        it('should send message and return MessageId', async () => {
            const params = {
                QueueUrl: 'https://queue-url',
                MessageBody: JSON.stringify({ test: 'data' }),
            };

            const result = await worker.sendAsyncSQSMessage(params);

            expect(result).toBe('message-123');
            expect(mockQueueClient.sendMessage).toHaveBeenCalledWith(params);
        });

        it('should handle send errors', async () => {
            mockQueueClient.sendMessage.mockRejectedValue(
                new Error('Send failed')
            );

            const params = {
                QueueUrl: 'https://queue-url',
                MessageBody: 'test',
            };

            await expect(worker.sendAsyncSQSMessage(params)).rejects.toThrow(
                'Send failed'
            );
        });
    });

    describe('send()', () => {
        it('should validate params and send message with delay', async () => {
            worker._validateParams = jest.fn();

            const params = {
                QueueUrl: 'https://queue-url',
                data: 'test',
            };

            const result = await worker.send(params, 5);

            expect(worker._validateParams).toHaveBeenCalledWith(params);
            expect(result).toBe('message-123');
            expect(mockQueueClient.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    DelaySeconds: 5,
                    QueueUrl: 'https://queue-url',
                })
            );
        });

        it('should send message with zero delay by default', async () => {
            worker._validateParams = jest.fn();

            const params = {
                QueueUrl: 'https://queue-url',
                data: 'test',
            };

            await worker.send(params);

            expect(mockQueueClient.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    DelaySeconds: 0,
                })
            );
        });
    });

    describe('run()', () => {
        it('should process SQS records', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockResolvedValue(undefined);

            const params = {
                Records: [
                    { body: JSON.stringify({ task: 'test-1' }) },
                    { body: JSON.stringify({ task: 'test-2' }) },
                ],
            };

            await worker.run(params);

            expect(worker._run).toHaveBeenCalledTimes(2);
            expect(worker._run).toHaveBeenCalledWith({ task: 'test-1' }, {});
            expect(worker._run).toHaveBeenCalledWith({ task: 'test-2' }, {});
        });

        it('should pass context to _run method', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockResolvedValue(undefined);

            const params = {
                Records: [{ body: JSON.stringify({ task: 'test' }) }],
            };
            const context = { userId: '123' };

            await worker.run(params, context);

            expect(worker._run).toHaveBeenCalledWith({ task: 'test' }, context);
        });
    });
});
