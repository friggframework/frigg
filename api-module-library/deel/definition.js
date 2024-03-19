require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/core");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            console.log('getting token', code);
            return api.getTokenFromCodeBasicAuthHeader(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const tokenDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: tokenDetails.id, user: userId },
                details: { name: tokenDetails.name },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: []
        },
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
