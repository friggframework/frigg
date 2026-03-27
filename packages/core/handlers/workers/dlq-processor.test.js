const { dlqProcessor } = require('./dlq-processor');

describe('DLQ Processor', () => {
    let consoleSpy;

    beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    it('should log failed message with event type and integration context', async () => {
        const event = {
            Records: [{
                messageId: 'msg-123',
                body: JSON.stringify({
                    event: 'POST_CREATE_SETUP',
                    data: { integrationId: '3862' },
                }),
                attributes: {
                    ApproximateReceiveCount: '3',
                },
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:quo-integrations--prod-PipedriveQueue',
            }],
        };

        await dlqProcessor(event);

        expect(consoleSpy).toHaveBeenCalledWith(
            '[DLQ] Failed message',
            expect.objectContaining({
                messageId: 'msg-123',
                event: 'POST_CREATE_SETUP',
                integrationId: '3862',
                receiveCount: '3',
                sourceQueue: 'quo-integrations--prod-PipedriveQueue',
            })
        );
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

        expect(consoleSpy).toHaveBeenCalledWith(
            '[DLQ] Failed message',
            expect.objectContaining({
                messageId: 'msg-456',
                event: 'UNKNOWN',
                rawBody: 'not json',
            })
        );
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

        expect(consoleSpy).toHaveBeenCalledTimes(2);
    });

    it('should not throw — DLQ processor must always succeed', async () => {
        const event = {
            Records: [{
                messageId: 'msg-789',
                body: JSON.stringify({ event: 'SOME_EVENT', data: {} }),
                attributes: {},
                eventSourceARN: 'arn:aws:sqs:us-east-1:123:Queue',
            }],
        };

        await expect(dlqProcessor(event)).resolves.not.toThrow();
    });

    it('should handle empty or missing Records gracefully', async () => {
        await expect(dlqProcessor({ Records: [] })).resolves.not.toThrow();
        await expect(dlqProcessor({})).resolves.not.toThrow();
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

        expect(consoleSpy).toHaveBeenCalledWith(
            '[DLQ] Failed message',
            expect.objectContaining({
                sentTimestamp: '1774564099000',
            })
        );
    });
});
