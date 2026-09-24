const crypto = require('node:crypto');
const { dlqProcessor } = require('./dlq-processor');
const { createMemorySink } = require('../../logs');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

describe('DLQ Processor', () => {
    let sink;
    let consoleSpies;

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'warn', 'error'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
    });

    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    const byEvent = (eventName) => sink.records.filter((r) => r.eventName === eventName);
    const failed = () => byEvent('frigg.queue.dlq.message_failed');

    it('should log failed message with event type and integration context', async () => {
        const body = JSON.stringify({
            event: 'POST_CREATE_SETUP',
            data: { integrationId: '3862' },
        });
        const event = {
            Records: [{
                messageId: 'msg-123',
                body,
                attributes: {
                    ApproximateReceiveCount: '3',
                },
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:quo-integrations--prod-PipedriveQueue',
            }],
        };

        await dlqProcessor(event, { awsRequestId: 'req-dlq' });

        expect(failed()).toEqual([
            expect.objectContaining({
                level: 'ERROR',
                logger: 'frigg.queue.dlq',
                requestId: 'req-dlq',
                messageId: 'msg-123',
                integrationEvent: 'POST_CREATE_SETUP',
                integrationId: '3862',
                receiveCount: 3,
                sourceQueue: 'quo-integrations--prod-PipedriveQueue',
                bodyLength: body.length,
                bodySha256: sha256(body),
            }),
        ]);
        expect(failed()[0]).not.toHaveProperty('droppedKeys');
    });

    it('should handle malformed message body gracefully', async () => {
        const event = {
            Records: [{
                messageId: 'msg-456',
                body: 'not json',
                attributes: {},
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:SomeQueue',
            }],
        };

        await dlqProcessor(event);

        const unparsed = byEvent('frigg.queue.dlq.body_unparsed');
        expect(unparsed).toHaveLength(1);
        expect(unparsed[0]).toMatchObject({
            level: 'WARN',
            messageId: 'msg-456',
            bodyLength: 8,
            bodySha256: sha256('not json'),
        });
        expect(failed()).toEqual([
            expect.objectContaining({ messageId: 'msg-456', bodyLength: 8, bodySha256: sha256('not json') }),
        ]);
        expect(JSON.stringify(sink.records)).not.toContain('not json');
    });

    it('never writes the body, even when it holds a secret', async () => {
        const body = JSON.stringify({
            event: 'ON_WEBHOOK',
            data: { integrationId: '1', access_token: SECRETS.accessToken, note: `password=${SECRETS.password}` },
        });
        await dlqProcessor({ Records: [{ messageId: 'm', body, attributes: {} }] });
        await dlqProcessor({ Records: [{ messageId: 'm', body: `oops ${SECRETS.accessToken}`, attributes: {} }] });
        expect(sink.records).toContainNoSecretWindow([SECRETS.accessToken, SECRETS.password]);
    });

    it('should process multiple records in a batch', async () => {
        const event = {
            Records: [
                {
                    messageId: 'msg-1',
                    body: JSON.stringify({ event: 'ON_WEBHOOK', data: { integrationId: '100' } }),
                    attributes: { ApproximateReceiveCount: '1' },
                    eventSourceARN: 'arn:aws:sqs:us-east-1:123:Queue',
                },
                {
                    messageId: 'msg-2',
                    body: JSON.stringify({ event: 'INITIAL_SYNC', data: { processId: '200' } }),
                    attributes: { ApproximateReceiveCount: '3' },
                    eventSourceARN: 'arn:aws:sqs:us-east-1:123:Queue',
                },
            ],
        };

        await dlqProcessor(event);

        expect(failed()).toHaveLength(2);
        expect(failed()[0]).toMatchObject({ messageId: 'msg-1', integrationId: '100' });
        expect(failed()[0]).not.toHaveProperty('processId');
        expect(failed()[1]).toMatchObject({ messageId: 'msg-2', processId: '200' });
        expect(failed()[1]).not.toHaveProperty('integrationId');
    });

    it('should return empty batchItemFailures (all messages acknowledged)', async () => {
        const event = {
            Records: [{
                messageId: 'msg-789',
                body: JSON.stringify({ event: 'SOME_EVENT', data: {} }),
                attributes: {},
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:Queue',
            }],
        };

        const result = await dlqProcessor(event);
        expect(result).toEqual({ batchItemFailures: [] });
    });

    it('should handle empty or missing Records gracefully', async () => {
        const result1 = await dlqProcessor({ Records: [] });
        expect(result1).toEqual({ batchItemFailures: [] });

        const result2 = await dlqProcessor({});
        expect(result2).toEqual({ batchItemFailures: [] });
    });

    it('logs record_failed and still acknowledges when a record cannot be handled', async () => {
        const hostile = { messageId: 'bad', attributes: {} };
        Object.defineProperty(hostile, 'eventSourceARN', {
            get: () => { throw new Error('arn getter'); },
        });
        const result = await dlqProcessor({ Records: [hostile] });
        expect(result).toEqual({ batchItemFailures: [] });
        expect(byEvent('frigg.queue.dlq.record_failed')).toEqual([
            expect.objectContaining({ level: 'ERROR', messageId: 'bad', error: expect.objectContaining({ message: 'arn getter' }) }),
        ]);
    });

    it('should include sentTimestamp in structured log', async () => {
        const event = {
            Records: [{
                messageId: 'msg-ts',
                body: JSON.stringify({ event: 'TEST', data: {} }),
                attributes: {
                    ApproximateReceiveCount: '1',
                    SentTimestamp: '1774564099000',
                },
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:Queue',
            }],
        };

        await dlqProcessor(event);

        expect(failed()[0]).toMatchObject({ sentTimestamp: '1774564099000' });
    });
});
