const { ApiKeyRequester } = require('@friggframework/core');
const crypto = require('crypto');

class WebhookMockApi extends ApiKeyRequester {
    constructor(params = {}) {
        super(params);
        this.baseUrl = 'https://mock-webhook-api.example.com';
        this.webhookSecret = params.webhookSecret || 'default-webhook-secret';
    }

    getAuthorizationRequirements() {
        return {
            type: 'form',
            fields: [
                { name: 'apiKey', label: 'API Key', type: 'password', required: true },
            ],
        };
    }

    async getUserDetails() {
        return {
            id: 'webhook-user-123',
            email: 'webhookuser@example.com',
        };
    }

    async registerWebhook(url, events) {
        return {
            id: `webhook-${Date.now()}`,
            url,
            events,
            active: true,
        };
    }

    validateWebhookSignature(payload, signature) {
        if (signature === 'valid-signature') return true;
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        return signature === expectedSignature;
    }
}

const Definition = {
    API: WebhookMockApi,
    getName: () => 'webhook-mock',
    moduleName: 'webhook-mock',
    modelName: 'WebhookMock',
    requiredAuthMethods: {
        getToken: async (api, params) => {
            api.setApiKey(params.data?.apiKey);
            return { api_key: params.data?.apiKey };
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.id, user: userId },
                details: { email: userDetails.email },
            };
        },
        apiPropertiesToPersist: {
            credential: ['api_key'],
            entity: [],
        },
        getCredentialDetails: async (api, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.id, user: userId },
                details: {},
            };
        },
        testAuthRequest: async (api) => {
            return api.getUserDetails();
        },
    },
    env: {},
};

module.exports = { Definition, WebhookMockApi };
