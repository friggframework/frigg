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

    describe('run() message scope (ADR-048 §7)', () => {
        const { getLogger, createMemorySink } = require('../logs');
        const { runInContext } = require('../logs/context');
        const { HaltError } = require('../errors/halt-error');

        const record = (messageId, receiveCount, data) => ({
            messageId,
            attributes: { ApproximateReceiveCount: receiveCount },
            body: JSON.stringify({ event: 'PROCESS_BATCH', data }),
        });

        let sink;
        beforeEach(() => {
            sink = createMemorySink();
            jest.spyOn(console, 'log').mockImplementation(() => {});
            jest.spyOn(console, 'warn').mockImplementation(() => {});
            jest.spyOn(console, 'error').mockImplementation(() => {});
        });
        afterEach(() => jest.restoreAllMocks());

        it('gives records inside _run the message ids from the SQS record and body', async () => {
            worker._run = async () => getLogger('integration.test').info('inside');
            await worker.run({
                Records: [record('m-1', '2', { processId: 'p-1', integrationId: 'i-1' })],
            });
            expect(sink.records[0]).toMatchObject({
                messageId: 'm-1',
                receiveCount: 2,
                processId: 'p-1',
                integrationId: 'i-1',
                integrationEvent: 'PROCESS_BATCH',
            });
        });

        it('opens one scope per record, with no leak across records', async () => {
            worker._run = async () => getLogger('integration.test').info('inside');
            await worker.run({
                Records: [
                    record('m-1', '1', { processId: 'p-1' }),
                    { messageId: 'm-2', attributes: {}, body: JSON.stringify({ event: 'OTHER', data: {} }) },
                ],
            });
            expect(sink.records[0]).toMatchObject({ messageId: 'm-1', processId: 'p-1' });
            expect(sink.records[1]).toMatchObject({ messageId: 'm-2', integrationEvent: 'OTHER' });
            expect(sink.records[1]).not.toHaveProperty('processId');
            expect(sink.records[1]).not.toHaveProperty('receiveCount');
        });

        it('does not carry record 1 ids onto a record 2 that has none', async () => {
            worker._run = async () => getLogger('integration.test').info('inside');
            await worker.run({
                Records: [
                    record('m-1', '4', { processId: 'p-1', integrationId: 'i-1' }),
                    { body: JSON.stringify({ data: {} }) },
                ],
            });
            expect(sink.records).toHaveLength(2);
            for (const key of ['messageId', 'receiveCount', 'processId', 'integrationId', 'integrationEvent']) {
                expect(sink.records[1]).not.toHaveProperty(key);
            }
            expect(sink.records[0]).toMatchObject({ messageId: 'm-1', receiveCount: 4 });
        });

        it('keeps the invocation scope (requestId survives)', async () => {
            worker._run = async () => getLogger('integration.test').info('inside');
            await runInContext({ log: { requestId: 'r-1' } }, () =>
                worker.run({ Records: [record('m-1', '1', {})] })
            );
            expect(sink.records[0]).toMatchObject({ requestId: 'r-1', messageId: 'm-1' });
        });

        it('keeps the halt and failure behaviour inside the scope', async () => {
            worker._run = jest
                .fn()
                .mockRejectedValueOnce(new HaltError('stop'))
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValueOnce(undefined);
            const result = await worker.run({
                Records: [record('m-1', '1', {}), record('m-2', '1', {}), record('m-3', '1', {})],
            });
            expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'm-2' }] });
            expect(worker._run).toHaveBeenCalledTimes(3);
        });
    });

    describe('run() failure records (ADR-048 §4)', () => {
        const { createMemorySink } = require('../logs');
        const { HaltError } = require('../errors/halt-error');
        const { SECRETS } = require('../logs/__fixtures__/secrets');

        const axiosError = () => {
            const error = new Error(`Request failed: GET https://api.example.com/x?api_key=${SECRETS.apiKeyQuery}`);
            error.name = 'AxiosError';
            error.config = { headers: { Authorization: `Bearer ${SECRETS.bearer}` } };
            error.request = { _header: `GET /x HTTP/1.1\r\nAuthorization: Bearer ${SECRETS.bearer}\r\n` };
            error.response = { status: 401, data: { access_token: SECRETS.accessToken } };
            return error;
        };
        const secrets = [SECRETS.apiKeyQuery, SECRETS.bearer, SECRETS.accessToken];
        const body = JSON.stringify({ event: 'SYNC', data: {} });

        let sink;
        let spies;
        beforeEach(() => {
            sink = createMemorySink();
            spies = ['log', 'warn', 'error'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
        });
        afterEach(() => jest.restoreAllMocks());

        const consoleText = () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls), (_k, v) =>
            v instanceof Error ? { message: v.message, stack: v.stack, ...v } : v);

        it('writes one WARN frigg.worker.record_failed for a retried record and no raw error to console', async () => {
            worker._run = jest.fn().mockRejectedValue(axiosError());
            const result = await worker.run({ Records: [{ messageId: 'm-1', body, attributes: { ApproximateReceiveCount: '2' } }] });

            expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'm-1' }] });
            const failed = sink.records.filter((r) => r.eventName === 'frigg.worker.record_failed');
            expect(failed).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    logger: 'frigg.worker',
                    messageId: 'm-1',
                    receiveCount: 2,
                    error: expect.objectContaining({ type: 'AxiosError', status: 401 }),
                }),
            ]);
            expect(sink.records).toContainNoSecretWindow(secrets);
            expect(consoleText()).toContainNoSecretWindow(secrets);
            expect(spies[2]).not.toHaveBeenCalled();
        });

        it('writes one ERROR frigg.worker.record_halted for a halt and no raw error to console', async () => {
            const halt = new HaltError(`stop: Authorization: Bearer ${SECRETS.bearer}`);
            worker._run = jest.fn().mockRejectedValue(halt);
            const result = await worker.run({ Records: [{ messageId: 'm-2', body, attributes: {} }] });

            expect(result).toEqual({ batchItemFailures: [] });
            expect(sink.records.filter((r) => r.eventName === 'frigg.worker.record_halted')).toEqual([
                expect.objectContaining({ level: 'ERROR', messageId: 'm-2', error: expect.objectContaining({ type: 'HaltError' }) }),
            ]);
            expect(sink.records).toContainNoSecretWindow([SECRETS.bearer]);
            expect(consoleText()).toContainNoSecretWindow([SECRETS.bearer]);
            expect(spies[1]).not.toHaveBeenCalled();
        });
    });
});
