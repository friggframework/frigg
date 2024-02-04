require('dotenv').config();
const { Api } = require('./api');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const { get } = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function () { return config.name },
    name: config.name,//maybe not required
    Credential,
    Entity,
    requiredAuthMethods: {
        getToken: async function (api, params) {
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function (api, callbackParams, tokenResponse) {
            const entityDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: entityDetails.identifier },
                details: { name: entityDetails.name },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token', 'userId'],
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
            return await api.getUserDetails()
        },
    },
    env: {
        client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID,
        client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/google-calendar`,
        scope: process.env.GOOGLE_CALENDAR_SCOPE,
    }
};

module.exports = { Definition };