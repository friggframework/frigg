/**
 * Tests for QueuerUtil - AWS SDK v3 Migration
 * 
 * Tests SQS operations using aws-sdk-client-mock
 */

const { mockClient } = require('aws-sdk-client-mock');
const { SQSClient, SendMessageCommand, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');
const { QueuerUtil } = require('./queuer-util');

describe('QueuerUtil - AWS SDK v3', () => {
    let sqsMock;

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

            const result = await QueuerUtil.send(message, queueUrl);

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

    describe('SQS-safe message bodies', () => {
        // SQS accepts #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
        // [#x10000-#x10FFFF] and rejects the whole message otherwise
        // (InvalidMessageContents). A webhook payload can carry U+FFFE.
        const SQS_DISALLOWED =
            /[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
        const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';
        const message = {
            event: 'record.updated',
            name: 'Ana\uFFFE Lima\uFFFF',
            note: 'lone \uD800 surrogate, emoji \u{1F600}, tab\tnewline\n',
            ['key\uFFFE']: 'value',
        };

        it('send() escapes characters SQS rejects and keeps the body lossless', async () => {
            sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-1' });

            await QueuerUtil.send(message, queueUrl);

            const body = sqsMock.call(0).args[0].input.MessageBody;
            expect(SQS_DISALLOWED.test(body)).toBe(false);
            expect(JSON.parse(body)).toEqual(message);
        });

        it('batchSend() escapes characters SQS rejects in every entry', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({ Successful: [{ Id: '1' }] });

            await QueuerUtil.batchSend([message], queueUrl);

            const [entry] = sqsMock.call(0).args[0].input.Entries;
            expect(SQS_DISALLOWED.test(entry.MessageBody)).toBe(false);
            expect(JSON.parse(entry.MessageBody)).toEqual(message);
        });

        it('leaves an already-safe body unchanged', async () => {
            sqsMock.on(SendMessageCommand).resolves({ MessageId: 'm-2' });
            const safe = { text: 'caf\u00e9 \u{1F600}', n: 1 };

            await QueuerUtil.send(safe, queueUrl);

            expect(sqsMock.call(0).args[0].input.MessageBody).toBe(
                JSON.stringify(safe)
            );
        });
    });

    describe('batchSend()', () => {
        it('should send batch of messages to SQS', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({ 
                Successful: [{ MessageId: 'msg-1' }],
                Failed: []
            });

            const entries = Array(5).fill().map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.batchSend(entries, queueUrl);

            expect(sqsMock.calls()).toHaveLength(1);
            
            const call = sqsMock.call(0);
            expect(call.args[0].input.Entries).toHaveLength(5);
            expect(call.args[0].input.QueueUrl).toBe(queueUrl);
        });

        it('should send multiple batches for large entry sets (10 per batch)', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({ 
                Successful: [],
                Failed: []
            });

            const entries = Array(25).fill().map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(entries, queueUrl);

            // Should send 3 batches (10 + 10 + 5)
            expect(sqsMock.calls()).toHaveLength(3);
            
            expect(sqsMock.call(0).args[0].input.Entries).toHaveLength(10);
            expect(sqsMock.call(1).args[0].input.Entries).toHaveLength(10);
            expect(sqsMock.call(2).args[0].input.Entries).toHaveLength(5);
        });

        it('should handle empty entries array', async () => {
            const result = await QueuerUtil.batchSend([], 'https://queue-url');

            expect(result).toEqual({});
            expect(sqsMock.calls()).toHaveLength(0);
        });

        it('should send exact batch of 10 without remainder', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({ 
                Successful: [],
                Failed: []
            });

            const entries = Array(10).fill().map((_, i) => ({ data: `test-${i}` }));
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const result = await QueuerUtil.batchSend(entries, queueUrl);

            expect(sqsMock.calls()).toHaveLength(1);
            expect(result).toEqual({});  // Returns empty object when exact batch
        });

        it('should generate unique IDs for each entry', async () => {
            sqsMock.on(SendMessageBatchCommand).resolves({ 
                Successful: [],
                Failed: []
            });

            const entries = [{ data: 'test-1' }, { data: 'test-2' }];
            const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            await QueuerUtil.batchSend(entries, queueUrl);

            const sentEntries = sqsMock.call(0).args[0].input.Entries;
            expect(sentEntries[0].Id).toBeDefined();
            expect(sentEntries[1].Id).toBeDefined();
            expect(sentEntries[0].Id).not.toBe(sentEntries[1].Id);
        });
    });
});

