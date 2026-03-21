/**
 * Tests for QueuerUtil - Provider-Agnostic Queue Interface
 *
 * Tests queue operations using a mock QueueClientInterface.
 * No AWS SDK dependency — the queue client is injected via setQueueClient().
 */

const { QueuerUtil } = require('./queuer-util');

describe('QueuerUtil', () => {
    let mockQueueClient;
    let sendMessageCalls;
    let sendMessageBatchCalls;

    beforeEach(() => {
        sendMessageCalls = [];
        sendMessageBatchCalls = [];

        mockQueueClient = {
            sendMessage: jest.fn(async (params) => {
                sendMessageCalls.push(params);
                return { MessageId: 'test-message-id-123' };
            }),
            sendMessageBatch: jest.fn(async (params) => {
                sendMessageBatchCalls.push(params);
                return { Successful: [], Failed: [] };
            }),
            getQueueUrl: jest.fn(async (params) => {
                return `https://sqs.us-east-1.amazonaws.com/123456789/${params.QueueName}`;
            }),
        };

        QueuerUtil.setQueueClient(mockQueueClient);
    });

    afterEach(() => {
        // Reset the queue client to prevent leaking between test files
        QueuerUtil.setQueueClient(null);
    });

    describe('setQueueClient()', () => {
        it('should throw if no queue client is set', async () => {
            QueuerUtil.setQueueClient(null);

            await expect(
                QueuerUtil.send({ test: 'data' }, 'https://queue-url')
            ).rejects.toThrow('QueuerUtil requires a queue client');
        });
    });

    describe('send()', () => {
        it('should send single message via queue client', async () => {
            const message = { test: 'data', id: 1 };
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.send(message, queueUrl);

            expect(result.MessageId).toBe('test-message-id-123');
            expect(mockQueueClient.sendMessage).toHaveBeenCalledTimes(1);
            expect(mockQueueClient.sendMessage).toHaveBeenCalledWith({
                MessageBody: JSON.stringify(message),
                QueueUrl: queueUrl,
            });
        });

        it('should handle queue errors', async () => {
            mockQueueClient.sendMessage.mockRejectedValue(
                new Error('Queue Error')
            );

            const message = { test: 'data' };
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await expect(QueuerUtil.send(message, queueUrl)).rejects.toThrow(
                'Queue Error'
            );
        });
    });

    describe('batchSend()', () => {
        it('should send batch of messages via queue client', async () => {
            const entries = Array(5)
                .fill()
                .map((_, i) => ({ data: `test-${i}` }));
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(entries, queueUrl);

            expect(mockQueueClient.sendMessageBatch).toHaveBeenCalledTimes(1);

            const call = sendMessageBatchCalls[0];
            expect(call.Entries).toHaveLength(5);
            expect(call.QueueUrl).toBe(queueUrl);
        });

        it('should send multiple batches for large entry sets (10 per batch)', async () => {
            const entries = Array(25)
                .fill()
                .map((_, i) => ({ data: `test-${i}` }));
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(entries, queueUrl);

            // Should send 3 batches (10 + 10 + 5)
            expect(mockQueueClient.sendMessageBatch).toHaveBeenCalledTimes(3);

            expect(sendMessageBatchCalls[0].Entries).toHaveLength(10);
            expect(sendMessageBatchCalls[1].Entries).toHaveLength(10);
            expect(sendMessageBatchCalls[2].Entries).toHaveLength(5);
        });

        it('should handle empty entries array', async () => {
            QueuerUtil.setQueueClient(null); // Should not need a client for empty
            // Re-set because empty array returns early before calling client
            QueuerUtil.setQueueClient(mockQueueClient);

            const result = await QueuerUtil.batchSend([], 'https://queue-url');

            expect(result).toEqual({});
            expect(mockQueueClient.sendMessageBatch).not.toHaveBeenCalled();
        });

        it('should send exact batch of 10 without remainder', async () => {
            const entries = Array(10)
                .fill()
                .map((_, i) => ({ data: `test-${i}` }));
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.batchSend(entries, queueUrl);

            expect(mockQueueClient.sendMessageBatch).toHaveBeenCalledTimes(1);
            expect(result).toEqual({}); // Returns empty object when exact batch
        });

        it('should generate unique IDs for each entry', async () => {
            const entries = [{ data: 'test-1' }, { data: 'test-2' }];
            const queueUrl =
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(entries, queueUrl);

            const sentEntries = sendMessageBatchCalls[0].Entries;
            expect(sentEntries[0].Id).toBeDefined();
            expect(sentEntries[1].Id).toBeDefined();
            expect(sentEntries[0].Id).not.toBe(sentEntries[1].Id);
        });
    });
});
