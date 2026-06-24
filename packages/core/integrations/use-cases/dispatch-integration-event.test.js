/**
 * Tests for dispatchIntegrationEvent — the central producer decision that runs
 * an event in-process (sync) or enqueues it on the FIFO queue (queue).
 */

const mockSend = jest.fn();
jest.mock('../../queues', () => ({
    QueuerUtil: { send: (...args) => mockSend(...args) },
}));

const { dispatchIntegrationEvent } = require('./dispatch-integration-event');

const makeInstance = ({ on = {}, defaultEvents = {}, id = 'int-1' } = {}) => ({
    id,
    on,
    defaultEvents,
    send: jest.fn().mockResolvedValue({ ran: true }),
});

describe('dispatchIntegrationEvent', () => {
    const ORIGINAL_ENV = process.env.USER_ACTION_QUEUE_URL;

    beforeEach(() => {
        mockSend.mockReset().mockResolvedValue({ MessageId: 'msg-123' });
        process.env.USER_ACTION_QUEUE_URL =
            'https://sqs.us-east-1.amazonaws.com/1/q.fifo';
    });

    afterAll(() => {
        if (ORIGINAL_ENV === undefined)
            delete process.env.USER_ACTION_QUEUE_URL;
        else process.env.USER_ACTION_QUEUE_URL = ORIGINAL_ENV;
    });

    it('runs the handler in-process for a sync event and returns its result', async () => {
        const instance = makeInstance({
            on: { ON_UPDATE: { dispatch: 'sync', handler: () => {} } },
            defaultEvents: { ON_UPDATE: {} },
        });

        const outcome = await dispatchIntegrationEvent({
            instance,
            event: 'ON_UPDATE',
            data: { config: { a: 1 } },
            userId: 'user-1',
        });

        expect(instance.send).toHaveBeenCalledWith('ON_UPDATE', {
            config: { a: 1 },
        });
        expect(outcome).toEqual({ result: { ran: true } });
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('enqueues a queue event with messageGroupId=instance.id and does not run inline', async () => {
        const instance = makeInstance({
            on: { ON_UPDATE: { dispatch: 'queue', handler: () => {} } },
            defaultEvents: { ON_UPDATE: {} },
            id: 'int-42',
        });

        const outcome = await dispatchIntegrationEvent({
            instance,
            event: 'ON_UPDATE',
            data: { config: { a: 1 } },
            userId: 'user-1',
        });

        expect(instance.send).not.toHaveBeenCalled();
        expect(mockSend).toHaveBeenCalledTimes(1);

        const [envelope, queueUrl, opts] = mockSend.mock.calls[0];
        expect(queueUrl).toBe(process.env.USER_ACTION_QUEUE_URL);
        expect(opts.messageGroupId).toBe('int-42');
        expect(opts.messageDeduplicationId).toEqual(expect.any(String));
        expect(envelope).toMatchObject({
            event: 'ON_UPDATE',
            integrationId: 'int-42',
            userId: 'user-1',
        });
        expect(envelope.requestId).toBe(opts.messageDeduplicationId);
        // data is the exact handler payload — no framework keys leaked.
        expect(envelope.data).toEqual({ config: { a: 1 } });
        expect(outcome).toMatchObject({
            queued: true,
            messageId: 'msg-123',
        });
    });

    it('falls back to sync (with a warning) when the queue URL is not configured', async () => {
        delete process.env.USER_ACTION_QUEUE_URL;
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const instance = makeInstance({
            on: { ON_UPDATE: { dispatch: 'queue', handler: () => {} } },
            defaultEvents: { ON_UPDATE: {} },
        });

        const outcome = await dispatchIntegrationEvent({
            instance,
            event: 'ON_UPDATE',
            data: { config: {} },
            userId: 'user-1',
        });

        expect(mockSend).not.toHaveBeenCalled();
        expect(instance.send).toHaveBeenCalled();
        expect(outcome).toEqual({ result: { ran: true } });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('ignores queue mode on read-shaped default events and runs them in-process', async () => {
        const instance = makeInstance({
            on: {
                GET_CONFIG_OPTIONS: { dispatch: 'queue', handler: () => {} },
            },
            defaultEvents: { GET_CONFIG_OPTIONS: {} },
        });

        const outcome = await dispatchIntegrationEvent({
            instance,
            event: 'GET_CONFIG_OPTIONS',
            data: {},
            userId: 'user-1',
        });

        expect(mockSend).not.toHaveBeenCalled();
        expect(instance.send).toHaveBeenCalled();
        expect(outcome).toEqual({ result: { ran: true } });
    });

    it('treats a custom user action (not a default event) as mutating and enqueues it', async () => {
        const instance = makeInstance({
            on: { PUSH_DEAL: { dispatch: 'queue', handler: () => {} } },
            defaultEvents: {}, // PUSH_DEAL is custom, not a default event
        });

        const outcome = await dispatchIntegrationEvent({
            instance,
            event: 'PUSH_DEAL',
            data: { foo: 'bar' },
            userId: 'user-1',
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
        expect(outcome).toMatchObject({ queued: true });
    });
});
