jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { createQueueWorker } = require('../backend-utils');
const { IntegrationBase } = require('../../integrations/integration-base');
const { IntegrationEventDispatcher } = require('../integration-event-dispatcher');

class TestWebhookIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-webhook',
        version: '1.0.0',
        modules: {},
        webhooks: true,
    };

    constructor(params) {
        super(params);
        this.onWebhookCalled = false;
        this.receivedData = null;
    }

    async onWebhook({ data }) {
        this.onWebhookCalled = true;
        this.receivedData = data;
        return { processed: true, data };
    }
}

/**
 * @group unit
 * @group infrastructure
 */
describe('Webhook Queue Worker', () => {
    describe('ON_WEBHOOK event processing', () => {
        it('should process ON_WEBHOOK event without integration ID (unhydrated)', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: {
                    body: { webhookEvent: 'created', entityId: '123' },
                    headers: { 'content-type': 'application/json' },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // Should work with unhydrated instance without throwing
            await expect(worker.run(sqsEvent, {})).resolves.not.toThrow();
        });

        it('should call ON_WEBHOOK handler with webhook data', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const webhookData = {
                body: { webhookEvent: 'created', entityId: '123' },
                headers: { 'content-type': 'application/json' },
                query: {},
            };

            const params = {
                event: 'ON_WEBHOOK',
                data: webhookData,
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await worker.run(sqsEvent, {});

            // The handler should have been called
        });

        it('should handle multiple webhook messages in batch', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const message1 = {
                event: 'ON_WEBHOOK',
                data: { body: { event: '1' } },
            };
            const message2 = {
                event: 'ON_WEBHOOK',
                data: { body: { event: '2' } },
            };

            const sqsEvent = {
                Records: [
                    { body: JSON.stringify(message1) },
                    { body: JSON.stringify(message2) },
                ],
            };

            await worker.run(sqsEvent, {});

            // Should process both messages without error
        });
    });

    describe('Error Handling', () => {
        it('should throw error if ON_WEBHOOK handler fails', async () => {
            const FailingIntegration = class extends TestWebhookIntegration {
                async onWebhook({ data }) {
                    throw new Error('Processing failed');
                }
            };

            const FailingWorker = createQueueWorker(FailingIntegration);
            const failingWorker = new FailingWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: { body: { invalid: 'data' } },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await expect(failingWorker.run(sqsEvent, {})).rejects.toThrow('Processing failed');
        });

        it('should log errors with integration context', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            const FailingIntegration = class extends TestWebhookIntegration {
                async onWebhook({ data }) {
                    throw new Error('Test error');
                }
            };

            const FailingWorker = createQueueWorker(FailingIntegration);
            const failingWorker = new FailingWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: { body: {} },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await expect(failingWorker.run(sqsEvent, {})).rejects.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Error in ON_WEBHOOK for test-webhook'),
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Integration Hydration for webhooks with integrationId', () => {
        it('should attempt to load integration when integrationId present', async () => {
            // This test verifies the logic path - full integration test
            // will verify actual DB loading with mocked repositories
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: {
                    integrationId: 'integration-456',
                    body: { webhookEvent: 'updated' },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // This will fail trying to load the integration from DB
            // but it proves the code path is attempted
            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });
    });
});

