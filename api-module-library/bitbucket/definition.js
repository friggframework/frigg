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
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function (api, _callbackParams, _tokenResponse, userId) {
            const entityDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: entityDetails.identifier, user: userId },
                details: { name: entityDetails.name },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token', 'expires_in'],
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
        client_id: process.env.BITBUCKET_CLIENT_ID,
        client_secret: process.env.BITBUCKET_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/bitbucket`,
    }
};

module.exports = { Definition };
