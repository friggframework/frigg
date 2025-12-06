const { IntegrationBase } = require('@friggframework/core');
const { Definition: WebhookMockDefinition } = require('../api-modules/webhookMockModule');

class WebhookIntegration extends IntegrationBase {
    static Definition = {
        name: 'webhook-integration',
        version: '1.0.0',
        supportedVersions: ['>=1.0.0'],
        modules: {
            webhookMock: {
                definition: WebhookMockDefinition,
                options: {},
            },
        },
        display: {
            name: 'Webhook Integration',
            description: 'Test integration with webhook support',
            icon: 'webhook-icon',
        },
    };

    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async getConfigOptions() {
        return {
            jsonSchema: {
                type: 'object',
                properties: {
                    webhookEvents: {
                        type: 'array',
                        items: { type: 'string' },
                        title: 'Webhook Events to Subscribe',
                    },
                },
            },
            uiSchema: {},
        };
    }

    async onWebhookReceived({ req, res }) {
        const signature = req.headers['x-webhook-signature'];
        const payload = req.body;

        if (!this.webhookMock) {
            return res.status(500).json({ error: 'Module not loaded' });
        }

        const isValid = this.webhookMock.api.validateWebhookSignature(payload, signature);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' });
        }

        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        return { processed: true, event: data.body?.event };
    }

    async testAuth() {
        let success = true;
        if (this.webhookMock) {
            try {
                await this.webhookMock.testAuth();
            } catch {
                success = false;
            }
        }
        return success;
    }
}

module.exports = { WebhookIntegration };
