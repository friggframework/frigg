/**
 * Fixture reproducing the Fathom API module Definition from
 * friggframework/api-module-library `next` branch,
 * `packages/v1-ready/fathom/definition.js`.
 *
 * Self-contained: no dotenv / @friggframework/core / live Api class.
 * Shape matches the real module for schema + structural validation.
 */

class FathomApi {
    static requesterType = 'apiKey';

    setApiKey(apiKey) {
        this.api_key = apiKey;
    }

    async listMeetings() {
        return { items: [] };
    }
}

const Definition = {
    API: FathomApi,
    getName: () => 'fathom',
    moduleName: 'fathom',
    modelName: 'Fathom',
    requiredAuthMethods: {
        getAuthorizationRequirements: () => ({
            type: 'apiKey',
            data: {
                jsonSchema: {
                    title: 'Fathom Authentication',
                    type: 'object',
                    required: ['api_key'],
                    properties: {
                        api_key: {
                            type: 'string',
                            title: 'API Key',
                        },
                    },
                },
                uiSchema: {
                    api_key: {
                        'ui:widget': 'password',
                        'ui:help':
                            'Generate an API key in Fathom under User Settings > API Access. Sent as the X-Api-Key header.',
                    },
                },
            },
        }),
        setAuthParams: async (api, params) => {
            const apiKey = params?.api_key || params?.access_token || null;
            api.setApiKey(apiKey);
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            return {
                identifiers: { externalId: 'fixture@example.com', userId },
                details: { name: 'Fathom' },
            };
        },
        getCredentialDetails: async (api, userId) => {
            return {
                identifiers: { externalId: 'fixture@example.com', userId },
                details: {},
            };
        },
        apiPropertiesToPersist: {
            credential: ['api_key'],
            entity: [],
        },
        testAuthRequest: async (api) => {
            return api.listMeetings({});
        },
    },
    env: {
        api_key: 'test-fathom-api-key',
    },
};

module.exports = { Definition, Api: FathomApi };
