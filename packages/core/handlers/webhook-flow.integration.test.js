jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integrations/integration-base');
const { IntegrationEventDispatcher } = require('./integration-event-dispatcher');
const { QueuerUtil } = require('../queues');

// Mock AWS SQS
jest.mock('aws-sdk', () => {
    const mockSQS = {
        sendMessage: jest.fn((params, callback) => {
            callback(null, { MessageId: 'mock-message-id-123' });
        }),
    };
    return {
        SQS: jest.fn(() => mockSQS),
        config: { update: jest.fn() },
    };
});

class WebhookTestIntegration extends IntegrationBase {
    static Definition = {
        name: 'webhook-test',
        version: '1.0.0',
        modules: {},
        webhooks: true,
    };

    constructor(params) {
        super(params);
        this.webhookData = null;
    }

    // Override for custom signature verification
    async onWebhookReceived({ req, res }) {
        const signature = req.headers['x-custom-signature'];

        if (signature && signature !== 'valid-signature-123') {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        await this.queueWebhook({
            integrationId: req.params.integrationId,
            body: req.body,
            headers: req.headers,
            query: req.query,
        });

        res.status(200).json({ received: true, verified: !!signature });
    }

    // Override for webhook processing
    async onWebhook({ data }) {
        this.webhookData = data;
        return { processed: true, webhookData: data };
    }
}

describe('Webhook Flow Integration Test', () => {
    describe('End-to-End Webhook Flow', () => {
        beforeEach(() => {
            jest.clearAllMocks();
            process.env.WEBHOOK_TEST_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';
        });

        it('should complete full webhook flow: HTTP → Queue → Worker', async () => {
            // Step 1: Simulate HTTP webhook received
            const integration = new WebhookTestIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const req = {
                body: { event: 'item.created', itemId: '12345' },
                params: { integrationId: 'int-789' },
                headers: { 'content-type': 'application/json' },
                query: {},
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            // Execute WEBHOOK_RECEIVED
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next: jest.fn(),
            });

            // Verify HTTP response
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true, verified: false });

            // Verify message was queued
            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            expect(mockSQS.sendMessage).toHaveBeenCalled();

            const queueCall = mockSQS.sendMessage.mock.calls[0][0];
            expect(queueCall.QueueUrl).toBe(process.env.WEBHOOK_TEST_QUEUE_URL);

            const queuedMessage = JSON.parse(queueCall.MessageBody);
            expect(queuedMessage.event).toBe('ON_WEBHOOK');
            expect(queuedMessage.data.integrationId).toBe('int-789');
            expect(queuedMessage.data.body).toEqual({ event: 'item.created', itemId: '12345' });

            // Step 2: Simulate worker processing from queue
            const workerIntegration = new WebhookTestIntegration();
            const workerDispatcher = new IntegrationEventDispatcher(workerIntegration);

            const result = await workerDispatcher.dispatchJob({
                event: 'ON_WEBHOOK',
                data: queuedMessage.data,
                context: {},
            });

            // Verify processing result
            expect(result.processed).toBe(true);
            expect(result.webhookData).toEqual(queuedMessage.data);
            expect(workerIntegration.webhookData).not.toBeNull();
        });

        it('should support custom signature verification', async () => {
            const integration = new WebhookTestIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const reqInvalid = {
                body: { event: 'test' },
                params: {},
                headers: { 'x-custom-signature': 'invalid-sig' },
                query: {},
            };
            const resInvalid = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            // Test invalid signature
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req: reqInvalid,
                res: resInvalid,
                next: jest.fn(),
            });

            expect(resInvalid.status).toHaveBeenCalledWith(401);
            expect(resInvalid.json).toHaveBeenCalledWith({ error: 'Invalid signature' });

            // Test valid signature
            const reqValid = {
                body: { event: 'test' },
                params: {},
                headers: { 'x-custom-signature': 'valid-signature-123' },
                query: {},
            };
            const resValid = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req: reqValid,
                res: resValid,
                next: jest.fn(),
            });

            expect(resValid.status).toHaveBeenCalledWith(200);
            expect(resValid.json).toHaveBeenCalledWith({ received: true, verified: true });
        });

        it('should handle webhooks without integration ID', async () => {
            const integration = new WebhookTestIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const req = {
                body: { event: 'system.event' },
                params: {}, // No integrationId
                headers: {},
                query: {},
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next: jest.fn(),
            });

            // Should queue with integrationId: null
            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            const queuedMessage = JSON.parse(mockSQS.sendMessage.mock.calls[0][0].MessageBody);

            expect(queuedMessage.data.integrationId).toBeNull();
        });

        it('should preserve webhook headers and query params', async () => {
            const integration = new WebhookTestIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const req = {
                body: { event: 'test' },
                params: { integrationId: 'int-456' },
                headers: {
                    'x-webhook-id': 'webhook-123',
                    'x-custom-header': 'value',
                },
                query: { timestamp: '2025-10-15', version: '2' },
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next: jest.fn(),
            });

            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            const queuedMessage = JSON.parse(mockSQS.sendMessage.mock.calls[0][0].MessageBody);

            expect(queuedMessage.data.headers).toEqual(req.headers);
            expect(queuedMessage.data.query).toEqual(req.query);
        });
    });

    describe('Default Webhook Handlers', () => {
        it('should use default WEBHOOK_RECEIVED handler if not overridden', async () => {
            // Integration without custom handler
            class DefaultWebhookIntegration extends IntegrationBase {
                static Definition = {
                    name: 'default-webhook',
                    version: '1.0.0',
                    modules: {},
                    webhooks: true,
                };
            }

            process.env.DEFAULT_WEBHOOK_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/default-queue';

            const integration = new DefaultWebhookIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const req = {
                body: { test: 'data' },
                params: {},
                headers: {},
                query: {},
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next: jest.fn(),
            });

            // Should use default handler
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ received: true });
        });

        it('should use default ON_WEBHOOK handler if not overridden', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            class DefaultWebhookIntegration extends IntegrationBase {
                static Definition = {
                    name: 'default-webhook-worker',
                    version: '1.0.0',
                    modules: {},
                    webhooks: true,
                };
            }

            const integration = new DefaultWebhookIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const webhookData = { body: { test: 'data' } };

            await dispatcher.dispatchJob({
                event: 'ON_WEBHOOK',
                data: webhookData,
                context: {},
            });

            // Default handler logs the data
            expect(consoleSpy).toHaveBeenCalledWith('Webhook received:', webhookData);

            consoleSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should handle queueing errors gracefully', async () => {
            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            mockSQS.sendMessage.mockImplementation((params, callback) => {
                callback(new Error('Queue is full'), null);
            });

            process.env.WEBHOOK_TEST_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

            const integration = new WebhookTestIntegration();
            const dispatcher = new IntegrationEventDispatcher(integration);

            const req = {
                body: { event: 'test' },
                params: {},
                headers: {},
                query: {},
            };
            const res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn(),
            };

            // Should throw error when queueing fails
            await expect(
                dispatcher.dispatchHttp({
                    event: 'WEBHOOK_RECEIVED',
                    req,
                    res,
                    next: jest.fn(),
                })
            ).rejects.toThrow('Queue is full');
        });

        it('should throw error if queue URL not configured', async () => {
            delete process.env.WEBHOOK_TEST_QUEUE_URL;

            const integration = new WebhookTestIntegration();

            await expect(
                integration.queueWebhook({ test: 'data' })
            ).rejects.toThrow('Queue URL not found for WEBHOOK_TEST_QUEUE_URL');
        });
    });
});

