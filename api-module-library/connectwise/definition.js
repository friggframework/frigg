require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/core");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        setAuthParams: async function(api, params){
            api.public_key = get(params, 'public_key');
            api.private_key = get(params, 'private_key');
            api.company_id = get(params, 'company_id');
            api.site = get(params, 'site');
            api.setup();
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            return {
                identifiers: { externalId: api.company_id, user: userId },
                details: {  },
            }
        },
        apiPropertiesToPersist: {
            credential: ['public_key', 'private_key', 'company_id', 'site'],
            entity: [],
        },
        getCredentialDetails: async function(api, userId) {
            return {
                identifiers: { externalId: api.company_id, user: userId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.listCallbacks();
        },
    },
    env: {
        client_id: process.env.CONNECTWISE_CLIENT_ID,
    }
};

module.exports = { Definition };
