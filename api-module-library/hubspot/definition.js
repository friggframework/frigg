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
                identifiers: { externalId: userDetails.portalId, userId: api.userId },
                details: { name: userDetails.hub_domain },
            }
        },
        apiPropertiesToPersist: [
            'userId', 'access_token', 'refresh_token', 'portalId'
        ],
        getCredentialDetails: async function(api) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.getUserDetails()
        },
    },
    env: {
        client_id: process.env.HUBSPOT_CLIENT_ID,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET,
        scope: process.env.HUBSPOT_SCOPE,
        redirect_uri: `${process.env.REDIRECT_URI}/hubspot`,
    }
};

module.exports = { Definition };