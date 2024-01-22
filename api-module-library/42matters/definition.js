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
            return api.setTokens({access_token: api.access_token});
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            return {
                identifiers: { externalId: '42matters', user: userId },
                details: {  },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token'],
            entity: [],
        },
        getCredentialDetails: async function(api, userId) {
            return {
                identifiers: { externalId: '42matters', user: userId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return await api.getAccountStatus();
        },
    },
    env: {
        access_token: process.env.MATTERS_ACCESS_TOKEN,
    }
};

module.exports = { Definition };
