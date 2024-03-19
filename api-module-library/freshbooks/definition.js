require('dotenv').config();
const {Api} = require('./api');
const {get} = require("@friggframework/core");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required,
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const accountId = String(callbackParams.data.account_id || callbackParams.data.appOrgId)
            this.accountId = accountId;
            return {
                identifiers: {
                    externalId: accountId,
                    subType: callbackParams.data.subType
                },
                details: { user: this.userId },
            }
        },
        getCredentialDetails: async function(api) {
            const userDetails = await api.getUserInfo();
            return {
                identifiers: { externalId: userDetails.identifier },
                details: { appUserId: userDetails.id}
            };
        },
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: ['accountId', 'subType']
        },
        testAuthRequest: async function(api){
            return await api.getUserInfo()
        },
        getAuthorizationRequirements(params) {
            return {
                url: this.api.getAuthUri(params),
                type: 'oauth2',
            };
        }
    },
    env: {
        client_id: process.env.FRESHBOOKS_CLIENT_ID,
        client_secret: process.env.FRESHBOOKS_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/freshbooks`,
    }
};

module.exports = { Definition };
