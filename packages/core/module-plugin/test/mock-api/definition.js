require('dotenv').config();
const { Api } = require('./api');
const { get } = require('../../../assertions');
const config = { name: 'anapi' }

const Definition = {
    API: Api,
    getAuthorizationRequirements: () => ({
        url: 'http://localhost:3000/redirect/anapi',
        type: 'oauth2',
    }),
    getName: function () { return config.name },
    moduleName: config.name,
    modelName: 'AnApi',
    requiredAuthMethods: {
        getToken: async function (api, params) {
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function (api, callbackParams, tokenResponse, userId) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId, user: userId },
                details: { name: userDetails.hub_domain },
            }
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token'
            ],
            entity: [],
        },
        getCredentialDetails: async function (api, userId) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId, user: userId },
                details: {}
            };
        },
        testAuthRequest: async function (api) {
            return api.getUserDetails()
        },
    },
    env: {
        client_id: 'test',
        client_secret: 'test',
        scope: 'test',
        redirect_uri: `http://localhost:3000/redirect/anapi`,
    }
};

module.exports = { Definition };
