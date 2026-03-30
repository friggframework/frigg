const { OAuth2Requester } = require('@friggframework/core');

class OAuth2MockApi extends OAuth2Requester {
    constructor(params = {}) {
        super(params);
        this.baseUrl = 'https://mock-oauth-api.example.com';
        this.tokenUri = 'https://mock-oauth-api.example.com/oauth/token';
        this.authorizationUri = `https://mock-oauth-api.example.com/oauth/authorize?client_id=${this.client_id}&redirect_uri=${this.redirect_uri}`;
    }

    getAuthorizationRequirements() {
        return {
            url: this.authorizationUri,
            type: 'oauth2',
        };
    }

    async getTokenFromCode(code) {
        return {
            access_token: `mock-access-token-${Date.now()}`,
            refresh_token: `mock-refresh-token-${Date.now()}`,
            expires_in: 3600,
        };
    }

    async getUserDetails() {
        return {
            id: 'mock-user-123',
            email: 'mockuser@example.com',
            name: 'Mock User',
        };
    }
}

const Definition = {
    API: OAuth2MockApi,
    getName: () => 'oauth2-mock',
    moduleName: 'oauth2-mock',
    modelName: 'OAuth2Mock',
    requiredAuthMethods: {
        getToken: async (api, params) => {
            const code = params.data?.code;
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async (api, callbackParams, tokenResponse, userId) => {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.id, user: userId },
                details: { name: userDetails.name, email: userDetails.email },
            };
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
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
    env: {
        client_id: 'mock-client-id',
        client_secret: 'mock-client-secret',
        redirect_uri: 'http://localhost:3000/redirect/oauth2-mock',
        scope: 'read write',
    },
};

module.exports = { Definition, OAuth2MockApi };
