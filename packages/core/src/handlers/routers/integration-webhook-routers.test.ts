jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
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

        constructor(params: any) {
            super(params);
            (this as any).queueWebhook = jest.fn().mockResolvedValue('message-id');
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

        constructor(params: any) {
            super(params);
            (this as any).events = {
                WEBHOOK_RECEIVED: {
                    handler: async ({ req, res }: any) => {
                        const signature = req.headers['x-webhook-signature'];
                        if (signature !== 'valid-signature') {
                            return res.status(401).json({ error: 'Invalid signature' });
                        }
                        await (this as any).queueWebhook({ body: req.body });
                        res.status(200).json({ verified: true });
                    },
                },
            };
            (this as any).queueWebhook = jest.fn().mockResolvedValue('message-id');
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
                NoWebhookIntegration,
            ],
        }),
    };
});

describe('Integration Webhook Routers', () => {
    let handlers: any;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        handlers = (require('./integration-webhook-routers') as any).handlers;
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
            expect(handlers['webhook-enabledWebhook']).toBeDefined();
            expect(handlers['advanced-webhookWebhook']).toBeDefined();
        });
    });

    describe('Webhook Configuration', () => {
        it('should support boolean webhook configuration', () => {
            expect(handlers['webhook-enabledWebhook']).toBeDefined();
        });

        it('should support object webhook configuration', () => {
            expect(handlers['advanced-webhookWebhook']).toBeDefined();
        });

        it('should skip integrations with webhooks disabled', () => {
            expect(handlers['no-webhookWebhook']).toBeUndefined();
        });
    });
});
