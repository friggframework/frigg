require('dotenv').config();
const {Api} = require('./api');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const {get} = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    name: config.name,//maybe not required
    Credential,
    Entity,
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.emailAddress },
                details: { name: userDetails.name },
            }
        },
        apiPropertiesToPersist: ['access_token', 'refresh_token', 'userId', 'expires_in'],
        getCredentialDetails: async function(api) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.emailAddress},
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return await api.getUserDetails()
        },
    },
    env: {
        client_id: process.env.GOOGLE_DRIVE_CLIENT_ID,
        client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/google-drive`,
        scope: process.env.GOOGLE_DRIVE_SCOPE,
    }
};

module.exports = { Definition };