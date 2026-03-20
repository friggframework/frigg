/**
 * Tests for Worker - AWS SDK v3 Migration
 *
 * Tests SQS Worker operations using aws-sdk-client-mock
 */

import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, GetQueueUrlCommand, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Worker } from './Worker';

describe('Worker - AWS SDK v3', () => {
    let sqsMock: ReturnType<typeof mockClient>;
    let worker: Worker;
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
            expect((call.args[0].input as any).DelaySeconds).toBe(5);
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
            expect((call.args[0].input as any).DelaySeconds).toBe(0);
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
    });
});
