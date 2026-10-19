jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
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

describe('IntegrationBase.onWebhookReceived: what a signature check needs travels with the delivery', () => {
    beforeEach(() => { mockSend.mockReset(); mockSend.mockResolvedValue({}); process.env.TEST_INTEGRATION_QUEUE_URL = 'https://sqs/test'; });
    const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
    const req = (over = {}) => ({
        method: 'POST', originalUrl: '/api/test-integration/webhooks/int-1?module=hubspot', params: { integrationId: 'int-1' }, query: { module: 'hubspot' },
        headers: { host: 'api.example.com', 'x-forwarded-proto': 'https', 'x-hubspot-signature-v3': 'sig' }, body: [{ objectId: 5 }],
        rawBody: Buffer.from('[ {"objectId":5} ]'), ...over,
    });

    it('queues the raw body exactly as received, the method and the public URL', async () => {
        await new TestIntegration().onWebhookReceived({ req: req(), res: res() });
        const [message] = mockSend.mock.calls[0];
        expect(message.data).toMatchObject({ integrationId: 'int-1', body: [{ objectId: 5 }], method: 'POST', url: 'https://api.example.com/api/test-integration/webhooks/int-1?module=hubspot', rawBody: '[ {"objectId":5} ]' });
    });

    it('leaves out a raw body over 96 KB (the queue message limit), so a check that needs it fails closed', async () => {
        const big = 'x'.repeat(96 * 1024 + 1);
        await new TestIntegration().onWebhookReceived({ req: req({ rawBody: Buffer.from(big), headers: { host: 'h' } }), res: res() });
        const [message] = mockSend.mock.calls[0];
        expect(message.data.rawBody).toBeUndefined();
        expect(message.data.url).toBe('https://h/api/test-integration/webhooks/int-1?module=hubspot');   // https unless told otherwise
    });

    it('webhookVerificationInput hands a module exactly those facts', () => {
        expect(new TestIntegration().webhookVerificationInput({ headers: { a: 1 }, body: { b: 2 }, rawBody: 'r', method: 'POST', url: 'u' })).toEqual({ headers: { a: 1 }, body: { b: 2 }, query: {}, rawBody: 'r', method: 'POST', url: 'u' });
    });
});

describe('the HTTP app keeps the raw body for webhook checks', () => {
    it('req.rawBody holds the bytes as sent, beside the parsed body', async () => {
        const request = require('supertest');
        const { createApp } = require('../../handlers/app-handler-helpers');
        let seen;
        const app = createApp((a) => a.post('/hook', (r, s) => { seen = { raw: r.rawBody?.toString('utf8'), body: r.body }; s.json({}); }));
        await request(app).post('/hook').set('content-type', 'application/json').send('{ "a" :1 }');
        expect(seen).toEqual({ raw: '{ "a" :1 }', body: { a: 1 } });
    });
});
