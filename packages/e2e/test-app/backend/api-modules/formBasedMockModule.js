const { ApiKeyRequester } = require('@friggframework/core');

class FormBasedMockApi extends ApiKeyRequester {
    constructor(params = {}) {
        super(params);
        this.baseUrl = 'https://mock-form-api.example.com';
        this.workspaceId = params.workspaceId || null;
    }

    getAuthorizationRequirements(step = 1) {
        if (step === 1) {
            return {
                type: 'form',
                fields: [
                    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
                ],
            };
        }
        return {
            type: 'form',
            fields: [
                { name: 'workspaceId', label: 'Workspace ID', type: 'text', required: true },
            ],
        };
    }

    async validateApiKey(apiKey) {
        return apiKey && apiKey.length > 5;
    }

    async getWorkspaces() {
        return [
            { id: 'ws-1', name: 'Workspace 1' },
            { id: 'ws-2', name: 'Workspace 2' },
        ];
    }

    async getUserDetails() {
        return {
            id: 'form-user-123',
            email: 'formuser@example.com',
            workspaceId: this.workspaceId,
        };
    }
}

const Definition = {
    API: FormBasedMockApi,
    getName: () => 'form-based-mock',
    moduleName: 'form-based-mock',
    modelName: 'FormBasedMock',
    authType: 'form',
    isMultiStep: true,
    requiredAuthMethods: {
        getAuthorizationRequirements: (api, step) => {
            return api.getAuthorizationRequirements(step);
        },
        processStep: async (api, step, data) => {
            if (step === 1) {
                const isValid = await api.validateApiKey(data.apiKey);
                if (!isValid) {
                    throw new Error('Invalid API key');
                }
                api.setApiKey(data.apiKey);
                return { nextStep: 2 };
            }
            if (step === 2) {
                api.workspaceId = data.workspaceId;
                return { complete: true };
            }
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.id, user: userId },
                details: { workspaceId: userDetails.workspaceId },
            };
        },
        apiPropertiesToPersist: {
            credential: ['api_key'],
            entity: ['workspaceId'],
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

module.exports = { Definition, FormBasedMockApi };
