require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/core");
const config = require('./defaultConfig.json')
const AuthFields = require("./authFields");

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        getAuthorizationRequirements: function() {
            return {
                url: null,
                data: AuthFields,
                type: Api.requesterType,
            };
        },
        getToken: async function(api, params){
            const password = get(params.data, 'password');
            const username = get(params.data, 'username');
            const customer_id = get(params.data, 'customer_id');

            api.password = password;
            api.username = username;
            api.setCustomerId(customer_id);

            await this.api.getTokenFromUsernamePassword();
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token', 'customer_id',
            ],
            entity: [],
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const externalId = api.customer_id;
            return {
                identifiers: {externalId, user: userId},
                details: {name: api.username}
            }
        },
        getCredentialDetails: async function(api, userId) {
            return {
                identifiers: { externalId: api.customer_id, user: userId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            const body = {
                "source_language": "en"
            };
            const response = await this.api.searchTranslations(body);
            return response.results;
        },
    },
    env: {
        client_id: process.env.UNBABEL_CLIENT_ID
    }
};

module.exports = { Definition };
