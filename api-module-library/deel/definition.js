require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            return api.getTokenFromCodeBasicAuthHeader(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const tokenDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: tokenDetails.id },
                details: { name: tokenDetails.name },
            }
        },
        apiPropertiesToPersist: ['access_token', 'expires_at', 'refresh_token'],
        getCredentialDetails: async function(api) {
            const tokenDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: tokenDetails.id },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return await api.getOrganization();
        },
    },
    env: {
        client_id: process.env.DEEL_CLIENT_ID,
        client_secret: process.env.DEEL_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/deel`,
        scope: process.env.DEEL_SCOPE,
    }
};

module.exports = { Definition };
