const { Api } = require('./api');

const Config = {
    name: 'test-api-b',
    displayName: 'Test API B',
    description: 'Test API module B for the local test environment',
    category: 'Testing',
};

const Definition = {
    API: Api,
    getName: () => Config.name,
    moduleName: Config.name,
    modelName: 'TestApiB',

    getAuthorizationRequirements: () => ({
        type: 'apiKey',
        data: {
            jsonSchema: {
                type: 'object',
                required: ['api_key'],
                properties: {
                    api_key: {
                        type: 'string',
                        title: 'API Key',
                        'ui:widget': 'password',
                    },
                },
            },
        },
    }),

    requiredAuthMethods: {
        getToken: async (api, params) => ({ api_key: params.data.api_key }),
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const accountInfo = await api.getAccountInfo();
            return {
                identifiers: { externalId: accountInfo.id, userId },
                details: { name: accountInfo.name },
            };
        },
        apiPropertiesToPersist: { credential: ['api_key'], entity: [] },
        getCredentialDetails: async (api, userId) => {
            const accountInfo = await api.getAccountInfo();
            return {
                identifiers: { externalId: accountInfo.id, userId },
                details: {},
            };
        },
        testAuthRequest: async (api) => api.getAccountInfo(),
    },

    env: {},
};

module.exports = { Definition, Config, Api };
