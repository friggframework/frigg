/**
 * Tests for Worker - AWS SDK v3 Migration
 * 
 * Tests SQS Worker operations using aws-sdk-client-mock
 */

const { mockClient } = require('aws-sdk-client-mock');
const { SQSClient, GetQueueUrlCommand, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { Worker } = require('./Worker');

describe('Worker - AWS SDK v3', () => {
    let sqsMock;
    let worker;
    const originalEnv = process.env;

    beforeEach(() => {
        sqsMock = mockClient(SQSClient);
        worker = new Worker();
        jest.clearAllMocks();
        process.env = { ...originalEnv, AWS_REGION: 'us-east-1' };
    });

    afterEach(() => {
        sqsMock.reset();
        process.env = originalEnv;
    });

    describe('getQueueURL()', () => {
        it('should get queue URL from SQS', async () => {
            sqsMock.on(GetQueueUrlCommand).resolves({
                QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
            });

            const result = await worker.getQueueURL({ QueueName: 'test-queue' });

            expect(result).toBe('https://sqs.us-east-1.amazonaws.com/123456789/test-queue');
            expect(sqsMock.calls()).toHaveLength(1);
            
            const call = sqsMock.call(0);
            expect(call.args[0].input).toMatchObject({
                QueueName: 'test-queue',
            });
        });

        it('should handle queue not found error', async () => {
            sqsMock.on(GetQueueUrlCommand).rejects(new Error('Queue does not exist'));

            await expect(worker.getQueueURL({ QueueName: 'nonexistent-queue' }))
                .rejects.toThrow('Queue does not exist');
        });
    });

    describe('sendAsyncSQSMessage()', () => {
        it('should send message and return MessageId', async () => {
            sqsMock.on(SendMessageCommand).resolves({
                MessageId: 'message-123',
            });

            const params = {
                QueueUrl: 'https://queue-url',
                MessageBody: JSON.stringify({ test: 'data' }),
            };

            const result = await worker.sendAsyncSQSMessage(params);

            expect(result).toBe('message-123');
            expect(sqsMock.calls()).toHaveLength(1);
        });

        it('should handle send errors', async () => {
            sqsMock.on(SendMessageCommand).rejects(new Error('Send failed'));

            const params = {
                QueueUrl: 'https://queue-url',
                MessageBody: 'test',
            };

            await expect(worker.sendAsyncSQSMessage(params)).rejects.toThrow('Send failed');
        });
    });

    describe('send()', () => {
        it('should validate params and send message with delay', async () => {
            sqsMock.on(SendMessageCommand).resolves({
                MessageId: 'delayed-message-id',
            });

            worker._validateParams = jest.fn();  // Mock validation

            const params = {
                QueueUrl: 'https://queue-url',
                data: 'test',
            };

            const result = await worker.send(params, 5);

            expect(worker._validateParams).toHaveBeenCalledWith(params);
            expect(result).toBe('delayed-message-id');
            
            const call = sqsMock.call(0);
            expect(call.args[0].input.DelaySeconds).toBe(5);
        });

        it('should send message with zero delay by default', async () => {
            sqsMock.on(SendMessageCommand).resolves({
                MessageId: 'message-id',
            });

            worker._validateParams = jest.fn();

            const params = {
                QueueUrl: 'https://queue-url',
                data: 'test',
            };

            await worker.send(params);

            const call = sqsMock.call(0);
            expect(call.args[0].input.DelaySeconds).toBe(0);
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
                Records: [
                    { body: JSON.stringify({ task: 'test' }) },
                ],
            };
            const context = { userId: '123' };

            await worker.run(params, context);

            expect(worker._run).toHaveBeenCalledWith({ task: 'test' }, context);
        });

        it('should return empty batchItemFailures when all records succeed', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockResolvedValue(undefined);

            const params = {
                Records: [
                    { messageId: 'msg-1', body: JSON.stringify({ task: 'test' }) },
                ],
            };

            const result = await worker.run(params);

            expect(result).toEqual({ batchItemFailures: [] });
        });

        it('should report failed record in batchItemFailures instead of throwing', async () => {
            // With ReportBatchItemFailures, Lambda tells SQS exactly which
            // messages failed. SQS retries only those, not the whole batch.
            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockRejectedValue(new Error('Handler failed'));

            const params = {
                Records: [
                    { messageId: 'msg-1', body: JSON.stringify({ event: 'POST_CREATE_SETUP' }) },
                ],
            };

            const result = await worker.run(params);

            expect(result).toEqual({
                batchItemFailures: [{ itemIdentifier: 'msg-1' }],
            });
        });

        it('should treat HaltError as success — message discarded, not retried', async () => {
            // HaltError means "stop processing, don't retry".
            // createHandler previously handled this, but Worker.run must
            // preserve the semantics now that it catches errors per-record.
            const haltError = new Error('Poison message');
            haltError.isHaltError = true;

            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockRejectedValue(haltError);

            const params = {
                Records: [
                    { messageId: 'msg-halt', body: JSON.stringify({ event: 'BAD' }) },
                ],
            };

            const result = await worker.run(params);

            // HaltError should NOT appear in batchItemFailures
            // SQS will delete the message (treat as success)
            expect(result).toEqual({ batchItemFailures: [] });
        });

        it('should isolate errors per record — one failure does not block others', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn()
                .mockResolvedValueOnce(undefined)        // record 1: success
                .mockRejectedValueOnce(new Error('fail')) // record 2: fails
                .mockResolvedValueOnce(undefined);        // record 3: still processed

            const params = {
                Records: [
                    { messageId: 'msg-1', body: JSON.stringify({ task: '1' }) },
                    { messageId: 'msg-2', body: JSON.stringify({ task: '2' }) },
                    { messageId: 'msg-3', body: JSON.stringify({ task: '3' }) },
                ],
            };

            const result = await worker.run(params);

            // All 3 records were processed
            expect(worker._run).toHaveBeenCalledTimes(3);
            // Only the failed record is reported
            expect(result).toEqual({
                batchItemFailures: [{ itemIdentifier: 'msg-2' }],
            });
        });

        it('should report all failures when every record fails', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn().mockRejectedValue(new Error('fail'));

            const params = {
                Records: [
                    { messageId: 'msg-1', body: JSON.stringify({ task: '1' }) },
                    { messageId: 'msg-2', body: JSON.stringify({ task: '2' }) },
                ],
            };

            const result = await worker.run(params);

            expect(result).toEqual({
                batchItemFailures: [
                    { itemIdentifier: 'msg-1' },
                    { itemIdentifier: 'msg-2' },
                ],
            });
        });

        it('should handle malformed JSON in record body gracefully', async () => {
            worker._validateParams = jest.fn();
            worker._run = jest.fn();

            const params = {
                Records: [
                    { messageId: 'msg-1', body: 'not valid json' },
                    { messageId: 'msg-2', body: JSON.stringify({ task: 'ok' }) },
                ],
            };

            const result = await worker.run(params);

            // Malformed record reported as failure, valid record still processed
            expect(result.batchItemFailures).toEqual([{ itemIdentifier: 'msg-1' }]);
            expect(worker._run).toHaveBeenCalledTimes(1);
            expect(worker._run).toHaveBeenCalledWith({ task: 'ok' }, {});
        });
    });
});

