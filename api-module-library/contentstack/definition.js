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
            const state = get(params.data, 'state', null);
            api.location = get(params.data, 'location');
            return await api.getTokenFromCode(code);
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token', 'location', 'api_key',
            ],
            entity: [
                'organization_uid',
            ],
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const { roles } = await api.listRoles();
            const externalId = api.api_key;
            const name = roles[0].stack.name;
            return {
                identifiers: {externalId, user: userId},
                details: {name}
            }
        },
        getCredentialDetails: async function(api, userId) {
            return {
                identifiers: { externalId: api.api_key, user: userId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.listRoles()
        },
    },
    env: {
        client_id: process.env.CONTENTSTACK_CLIENT_ID,
        client_secret: process.env.CONTENTSTACK_CLIENT_SECRET,
        app_uid: process.env.CONTENTSTACK_APP_UID,
        redirect_uri: `${process.env.REDIRECT_URI}/contentstack`,
        scope: process.env.CONTENTSTACK_SCOPE,
    }
};

module.exports = { Definition };
