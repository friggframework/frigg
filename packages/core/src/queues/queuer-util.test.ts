/**
 * Tests for QueuerUtil - AWS SDK v3 Migration
 *
 * Tests SQS operations using aws-sdk-client-mock
 */

import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { QueuerUtil } from './queuer-util';

describe('QueuerUtil - AWS SDK v3', () => {
    let sqsMock: ReturnType<typeof mockClient>;

    beforeEach(() => {
        sqsMock = mockClient(SQSClient);
        jest.clearAllMocks();
    });

    afterEach(() => {
        sqsMock.reset();
    });

    describe('send()', () => {
        it('should send single message to SQS', async () => {
            sqsMock.on(SendMessageCommand).resolves({
                MessageId: 'test-message-id-123'
            });

            const message = { test: 'data', id: 1 };
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.send(message, queueUrl) as any;

            expect(result.MessageId).toBe('test-message-id-123');
            expect(sqsMock.calls()).toHaveLength(1);

            const call = sqsMock.call(0);
            expect(call.args[0].input).toMatchObject({
                MessageBody: JSON.stringify(message),
                QueueUrl: queueUrl,
            });
        });

        it('should handle SQS errors', async () => {
            sqsMock.on(SendMessageCommand).rejects(new Error('SQS Error'));

            const message = { test: 'data' };
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await expect(QueuerUtil.send(message, queueUrl)).rejects.toThrow('SQS Error');
        });
    });

    describe('batchSend()', () => {
        it('should send batch of messages to SQS', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({
                Successful: [{ MessageId: 'msg-1' }],
                Failed: []
            } as any);

            const entries = new Array(5).fill(null).map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(queueUrl, entries);

            expect(sqsMock.calls()).toHaveLength(1);

            const call = sqsMock.call(0);
            expect((call.args[0].input as any).Entries).toHaveLength(5);
            expect((call.args[0].input as any).QueueUrl).toBe(queueUrl);
        });

        it('should send multiple batches for large entry sets (10 per batch)', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({
                Successful: [],
                Failed: []
            } as any);

            const entries = new Array(25).fill(null).map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(queueUrl, entries);

            // Should send 3 batches (10 + 10 + 5)
            expect(sqsMock.calls()).toHaveLength(3);

            expect((sqsMock.call(0).args[0].input as any).Entries).toHaveLength(10);
            expect((sqsMock.call(1).args[0].input as any).Entries).toHaveLength(10);
            expect((sqsMock.call(2).args[0].input as any).Entries).toHaveLength(5);
        });

        it('should handle empty entries array', async () => {
            const result = await QueuerUtil.batchSend('https://queue-url', []);

            expect(result).toEqual({});
            expect(sqsMock.calls()).toHaveLength(0);
        });

        it('should send exact batch of 10 without remainder', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({
                Successful: [],
                Failed: []
            } as any);

            const entries = new Array(10).fill(null).map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.batchSend(queueUrl, entries);

            expect(sqsMock.calls()).toHaveLength(1);
            expect(result).toEqual({});  // Returns empty object when exact batch
        });

        it('should generate unique IDs for each entry', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({
                Successful: [],
                Failed: []
            } as any);

            const entries = [{ data: 'test-1' }, { data: 'test-2' }];
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(queueUrl, entries);

            const sentEntries = (sqsMock.call(0).args[0].input as any).Entries;
            expect(sentEntries[0].Id).toBeDefined();
            expect(sentEntries[1].Id).toBeDefined();
            expect(sentEntries[0].Id).not.toBe(sentEntries[1].Id);
        });
    });
});
