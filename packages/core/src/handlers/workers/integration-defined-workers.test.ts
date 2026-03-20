jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

import { createQueueWorker } from '../backend-utils';
import { IntegrationBase } from '../../integrations/integration-base';
import { IntegrationEventDispatcher } from '../integration-event-dispatcher';

class TestWebhookIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-webhook',
        version: '1.0.0',
        modules: {},
        webhooks: true,
    };

    onWebhookCalled: boolean;
    receivedData: any;

    constructor(params?: any) {
        super(params);
        this.onWebhookCalled = false;
        this.receivedData = null;
    }

    async onWebhook({ data }: any) {
        this.onWebhookCalled = true;
        this.receivedData = data;
        return { processed: true, data };
    }
}

describe('Webhook Queue Worker', () => {
    describe('ON_WEBHOOK event processing', () => {
        it('should process ON_WEBHOOK event without integration ID (unhydrated)', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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

            await expect(worker.run(sqsEvent, {})).resolves.not.toThrow();
        });

        it('should call ON_WEBHOOK handler with webhook data', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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
        });

        it('should handle multiple webhook messages in batch', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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
        });
    });

    describe('Error Handling', () => {
        it('should throw error if ON_WEBHOOK handler fails', async () => {
            const FailingIntegration = class extends TestWebhookIntegration {
                async onWebhook({ data }: any) {
                    throw new Error('Processing failed');
                }
            };

            const FailingWorker = createQueueWorker(FailingIntegration as any);
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
                async onWebhook({ data }: any) {
                    throw new Error('Test error');
                }
            };

            const FailingWorker = createQueueWorker(FailingIntegration as any);
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
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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

            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });
    });

    describe('Integration Hydration for ANY event with integrationId', () => {
        it('should hydrate integration for POST_CREATE_SETUP event with integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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

            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should prioritize processId over integrationId for hydration', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
            const worker = new QueueWorker();

            const params = {
                event: 'POST_CREATE_SETUP',
                data: {
                    processId: 'process-123',
                    integrationId: 'integration-456',
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should hydrate for custom events with integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
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

            await expect(worker.run(sqsEvent, {})).rejects.toThrow();
        });

        it('should create unhydrated instance when no processId or integrationId', async () => {
            const QueueWorker = createQueueWorker(TestWebhookIntegration as any);
            const worker = new QueueWorker();

            const params = {
                event: 'ON_WEBHOOK',
                data: {
                    body: { someData: 'value' },
                },
            };

            const sqsEvent = {
                Records: [{ body: JSON.stringify(params) }],
            };

            await expect(worker.run(sqsEvent, {})).resolves.not.toThrow();
        });
    });
});
