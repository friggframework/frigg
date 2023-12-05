require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,
    modelName: 'HubSpot',
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId, user: api.userId },
                details: { name: userDetails.hub_domain },
            }
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token'
            ],
            entity: [],
        },
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
