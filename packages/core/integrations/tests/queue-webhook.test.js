jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockSend = jest.fn();
jest.mock('../../queues', () => ({
    QueuerUtil: { send: mockSend },
}));

const { IntegrationBase } = require('../integration-base');

class TestIntegration extends IntegrationBase {
    static Definition = { name: 'test-integration' };
}

class HyphenatedIntegration extends IntegrationBase {
    static Definition = { name: 'multi-word-name' };
}

describe('IntegrationBase.queueWebhook', () => {
    let originalEnv;

    beforeEach(() => {
        mockSend.mockReset();
        mockSend.mockResolvedValue({});
        originalEnv = { ...process.env };
        process.env.TEST_INTEGRATION_QUEUE_URL = 'https://sqs/test';
        process.env.MULTI_WORD_NAME_QUEUE_URL = 'https://sqs/multi';
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('defaults to ON_WEBHOOK dispatch event when caller omits event', async () => {
        // backward compat: existing onWebhookReceived calls queueWebhook
        // with { integrationId, body, headers, query } — no event field.
        const integration = new TestIntegration();
        await integration.queueWebhook({
            integrationId: 'int-1',
            body: { foo: 'bar' },
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
        const [message, url] = mockSend.mock.calls[0];
        expect(message.event).toBe('ON_WEBHOOK');
        expect(message.data).toEqual({
            integrationId: 'int-1',
            body: { foo: 'bar' },
        });
        expect(url).toBe('https://sqs/test');
    });

    it('honors a caller-supplied event so extension-bound handlers can dispatch', async () => {
        const integration = new TestIntegration();
        await integration.queueWebhook({
            event: 'HUBSPOT_WEBHOOK',
            integrationId: 'int-1',
            body: { portalId: 12345 },
        });

        expect(mockSend).toHaveBeenCalledTimes(1);
        const [message] = mockSend.mock.calls[0];
        expect(message.event).toBe('HUBSPOT_WEBHOOK');
        // event is stripped from the data payload so it doesn't leak through
        expect(message.data).toEqual({
            integrationId: 'int-1',
            body: { portalId: 12345 },
        });
        expect(message.data.event).toBeUndefined();
    });

    it('uses the integration name with hyphens converted to underscores for the queue env var', async () => {
        const integration = new HyphenatedIntegration();
        await integration.queueWebhook({ integrationId: 'int-1' });

        const [, url] = mockSend.mock.calls[0];
        expect(url).toBe('https://sqs/multi');
    });

    it('throws when the queue URL env var is not set', async () => {
        delete process.env.TEST_INTEGRATION_QUEUE_URL;
        const integration = new TestIntegration();
        await expect(
            integration.queueWebhook({ integrationId: 'int-1' })
        ).rejects.toThrow(/Queue URL not found for TEST_INTEGRATION_QUEUE_URL/);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('tolerates undefined payload (defaults to empty data)', async () => {
        const integration = new TestIntegration();
        await integration.queueWebhook();

        const [message] = mockSend.mock.calls[0];
        expect(message.event).toBe('ON_WEBHOOK');
        expect(message.data).toEqual({});
    });

    it('falsy event values fall back to ON_WEBHOOK rather than dispatching on empty string', async () => {
        const integration = new TestIntegration();
        await integration.queueWebhook({ event: '', integrationId: 'int-1' });

        const [message] = mockSend.mock.calls[0];
        expect(message.event).toBe('ON_WEBHOOK');
        expect(message.data).toEqual({ integrationId: 'int-1' });
    });
});
