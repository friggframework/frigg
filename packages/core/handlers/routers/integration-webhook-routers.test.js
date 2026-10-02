jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

jest.mock('../app-definition-loader', () => {
    const { IntegrationBase } = require('../../integrations/integration-base');

    class WebhookEnabledIntegration extends IntegrationBase {
        static Definition = {
            name: 'webhook-enabled',
            version: '1.0.0',
            modules: {},
            webhooks: true,
        };

        constructor(params) {
            super(params);
            this.queueWebhook = jest.fn().mockResolvedValue('message-id');
        }
    }

    class AdvancedWebhookIntegration extends IntegrationBase {
        static Definition = {
            name: 'advanced-webhook',
            version: '1.0.0',
            modules: {},
            webhooks: {
                enabled: true,
            },
        };

        constructor(params) {
            super(params);
            this.events = {
                WEBHOOK_RECEIVED: {
                    handler: async ({ req, res }) => {
                        // Custom signature verification
                        const signature = req.headers['x-webhook-signature'];
                        if (signature !== 'valid-signature') {
                            return res.status(401).json({ error: 'Invalid signature' });
                        }
                        await this.queueWebhook({ body: req.body });
                        res.status(200).json({ verified: true });
                    },
                },
            };
            this.queueWebhook = jest.fn().mockResolvedValue('message-id');
        }
    }

    class LoggingWebhookIntegration extends IntegrationBase {
        static Definition = {
            name: 'logging-webhook',
            version: '1.0.0',
            modules: {},
            webhooks: true,
        };

        constructor(params) {
            super(params);
            this.events = {
                WEBHOOK_RECEIVED: {
                    handler: async ({ req, res }) => {
                        const { mergeTelemetryContext } = require('../../telemetry/telemetry-context');
                        global.__webhookBusContext = mergeTelemetryContext();
                        this.logger.info('Webhook received', { eventName: 'integration.logging-webhook.received' });
                        if (req.params.integrationId) {
                            this.setIntegrationRecord?.({ record: { id: req.params.integrationId, userId: 'u-1' } });
                            this.id = req.params.integrationId;
                            this.logger.info('Webhook hydrated', { eventName: 'integration.logging-webhook.hydrated' });
                        }
                        res.status(200).json({ ok: true });
                    },
                },
            };
        }
    }

    class NoWebhookIntegration extends IntegrationBase {
        static Definition = {
            name: 'no-webhook',
            version: '1.0.0',
            modules: {},
        };
    }

    return {
        loadAppDefinition: () => ({
            integrations: [
                WebhookEnabledIntegration,
                AdvancedWebhookIntegration,
                LoggingWebhookIntegration,
                NoWebhookIntegration,
            ],
        }),
    };
});

describe('Integration Webhook Routers', () => {
    let handlers;

    beforeEach(() => {
        // Clear module cache to get fresh handlers
        jest.resetModules();
        jest.clearAllMocks();

        // Re-require after mocking
        handlers = require('./integration-webhook-routers').handlers;
    });

    describe('Handler Creation', () => {
        it('should create webhook handlers for integrations with webhooks: true', () => {
            expect(handlers['webhook-enabledWebhook']).toBeDefined();
            expect(handlers['webhook-enabledWebhook'].handler).toBeDefined();
        });

        it('should create webhook handlers for integrations with webhooks.enabled: true', () => {
            expect(handlers['advanced-webhookWebhook']).toBeDefined();
            expect(handlers['advanced-webhookWebhook'].handler).toBeDefined();
        });

        it('should not create webhook handlers for integrations without webhooks', () => {
            expect(handlers['no-webhookWebhook']).toBeUndefined();
        });

        it('should configure handlers to not use database connection', () => {
            // Handlers are created with createAppHandler(..., false)
            // This means shouldUseDatabase = false
            // Actual behavior is tested in integration tests
            expect(handlers['webhook-enabledWebhook']).toBeDefined();
            expect(handlers['advanced-webhookWebhook']).toBeDefined();
        });
    });

    describe('Webhook Configuration', () => {
        it('should support boolean webhook configuration', () => {
            // webhooks: true should enable webhook handling
            expect(handlers['webhook-enabledWebhook']).toBeDefined();
        });

        it('should support object webhook configuration', () => {
            // webhooks: { enabled: true } should enable webhook handling
            expect(handlers['advanced-webhookWebhook']).toBeDefined();
        });

        it('should skip integrations with webhooks disabled', () => {
            // webhooks: false or missing should not create handlers
            expect(handlers['no-webhookWebhook']).toBeUndefined();
        });
    });

    describe('logger scope (ADR-048)', () => {
        const invoke = (path) =>
            handlers['logging-webhookWebhook'].handler(
                {
                    version: '2.0',
                    routeKey: 'POST /api/logging-webhook-integration/webhooks/{proxy+}',
                    rawPath: path,
                    rawQueryString: '',
                    headers: { 'content-type': 'application/json' },
                    requestContext: { http: { method: 'POST', path }, requestId: 'r' },
                    body: '{}',
                    isBase64Encoded: false,
                },
                { awsRequestId: 'req-hook' }
            );

        let sink;
        beforeEach(() => {
            sink = require('../../logs').createMemorySink();
            delete global.__webhookBusContext;
        });

        it('puts the route integrationId on records, not on the telemetry bus', async () => {
            const res = await invoke('/api/logging-webhook-integration/webhooks/int-777');
            expect(res.statusCode).toBe(200);
            const received = sink.records.find((r) => r.eventName === 'integration.logging-webhook.received');
            expect(received).toMatchObject({ integrationId: 'int-777', requestId: 'req-hook' });
            expect(global.__webhookBusContext?.integrationId ?? null).toBeNull();
        });

        it('adds no droppedKeys when the hydrated binding repeats the id', async () => {
            await invoke('/api/logging-webhook-integration/webhooks/int-777');
            const hydrated = sink.records.find((r) => r.eventName === 'integration.logging-webhook.hydrated');
            expect(hydrated).toMatchObject({ integrationId: 'int-777' });
            expect(hydrated).not.toHaveProperty('droppedKeys');
        });

        it('adds no integrationId on the route without an id', async () => {
            await invoke('/api/logging-webhook-integration/webhooks');
            const received = sink.records.find((r) => r.eventName === 'integration.logging-webhook.received');
            expect(received).toBeDefined();
            expect(received).not.toHaveProperty('integrationId');
        });
    });
});
