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
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.emailAddress },
                details: { name: userDetails.name },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token', 'userId', 'expires_in'],
            entity: []
        },
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