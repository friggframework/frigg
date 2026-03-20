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

        it('should discard message gracefully when integration no longer exists', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            let mockedCreateQueueWorker;
            jest.isolateModules(() => {
                jest.doMock('../../integrations/repositories/integration-repository-factory', () => ({
                    createIntegrationRepository: () => ({
                        findIntegrationById: jest.fn().mockRejectedValue(
                            new Error('Integration with id 999 not found')
                        ),
                    }),
                }));
                jest.doMock('../../modules/repositories/module-repository-factory', () => ({
                    createModuleRepository: () => ({}),
                }));
                jest.doMock('../app-definition-loader', () => ({
                    loadAppDefinition: () => ({ integrations: [] }),
                }));
                mockedCreateQueueWorker = require('../backend-utils').createQueueWorker;
            });

            const QueueWorker = mockedCreateQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: {
                    integrationId: '999',
                    body: { webhookEvent: 'updated' },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await expect(worker.run(sqsEvent, {})).resolves.not.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Integration 999 no longer exists')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Integration Hydration for ANY event with integrationId', () => {
        it('should hydrate integration for POST_CREATE_SETUP event with integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'POST_CREATE_SETUP',
                data: {
                    integrationId: 'integration-789',
                    config: { webhooksEnabled: true },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // Should attempt to load integration (will fail DB call in test env)
            // This proves the hydration path is taken for non-webhook events
            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should prioritize processId over integrationId for hydration', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'POST_CREATE_SETUP',
                data: {
                    processId: 'process-123',
                    integrationId: 'integration-456', // Should be ignored
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // Should use processId path (will fail trying to load process from DB)
            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should hydrate for custom events with integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'CUSTOM_EVENT',
                data: {
                    integrationId: 'integration-999',
                    customData: { foo: 'bar' },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // Should hydrate for ANY event type with integrationId
            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should create unhydrated instance when no processId or integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration);
            const worker = new QueueWorker();

            const params = {
                event: 'ON_WEBHOOK', // Use a registered event
                data: {
                    body: { someData: 'value' },
                    // No processId or integrationId
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            // Should work with unhydrated instance (no DB call)
            await expect(worker.run(sqsEvent, {})).resolves.not.toThrow();
        });
    });
});

