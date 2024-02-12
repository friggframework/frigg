require('dotenv').config();
const { Api } = require('./api');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const { get } = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function () { return config.name },
    moduleName: config.name,
    Credential,
    Entity,
    requiredAuthMethods: {
        getToken: async function (api, params) {
            return api.getTokenFromCode(get(params.data, 'code'));
        },
        getEntityDetails: async function (api, _callbackParams, _tokenResponse, userId) {
            const entityDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: entityDetails.identifier, user: userId },
                details: { name: entityDetails.name },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token', 'token_type', 'expires_in', 'created_at'],
            entity: [],
        },
        getCredentialDetails: async function (api) {
            const userDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: userDetails.identifier },
                details: {}
            };
        },
        testAuthRequest: async function (api) {
            return api.getUserDetails()
        },
    },
    env: {
        client_id: process.env.GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/gitlab`,
        scope: process.env.GITLAB_SCOPE,
        base_url: process.env.GITLAB_BASE_URL,
    }
};

module.exports = { Definition };