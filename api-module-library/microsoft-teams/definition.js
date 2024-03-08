require('dotenv').config();
const {Api} = require('./api/api');
const {get} = require("@friggframework/core");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        getToken: async function(api, params){
            if (params) {
                const code = get(params.data, 'code', null);
                await api.graphApi.getTokenFromCode(code);
            }
            else {
                await api.getTokenFromClientCredentials();
            }
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const orgDetails = await api.graphApi.getOrganization();
            api.tenant_id = orgDetails.id;
            return {
                identifiers: { externalId: orgDetails.id },
                details: { name: orgDetails.displayName },
            }
        },
        apiPropertiesToPersist: {
            credential: ['graph_access_token', 'graph_refresh_token', 'bot_access_token'],
            entity: ['tenant_id']
        },
        getCredentialDetails: async function(api, userId) {
            const orgDetails = await api.graphApi.getOrganization();
            api.graph_access_token = api.graphApi.access_token;
            api.graph_refresh_token = api.graphApi.refresh_token;
            api.bot_access_token = api.botFrameworkApi.access_token;
            return {
                identifiers: { externalId: orgDetails.id},
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.graphApi.getOrganization();
        },
    },
    env: {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/microsoft-teams`,
        scope: process.env.TEAMS_SCOPE,
    }
};

module.exports = { Definition };