require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/assertions");
const config = require('./defaultConfig.json')
const md5 = require('md5');

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        setAuthParams: async function(api, params){},
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            return {
                identifiers: { externalId: md5(api.access_token), user: userId },
                details: {  },
            }
        },
        apiPropertiesToPersist: {
            credential: ['access_token'],
            entity: [],
        },
        getCredentialDetails: async function(api, userId) {
            return {
                identifiers: { externalId: md5(api.access_token), user: userId },
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
