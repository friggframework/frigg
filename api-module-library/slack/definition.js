require('dotenv').config();
const {Api} = require('./api');
const {get, flushDebugLog} = require("@friggframework/core");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    moduleName: config.name,//maybe not required
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code', null);

            let authInfo;
            try {
                authInfo = await api.getTokenFromCode(code);
            } catch (e) {
                flushDebugLog(e);
                throw new Error('Auth Error');
            }
            const authRes = await this.testAuth();
            if (!authRes) throw new Error('Auth Error');
            api.authed_user = authInfo.authed_user;
            api.team_id = authInfo.team.id;
            api.team_name = authInfo.team.name;

        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token',
            ],
            entity: ['team_id'],
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const isUserScopeAuthorized = api.authed_user && api.authed_user.access_token;

            const externalId = isUserScopeAuthorized ?
                api.authed_user.id : api.teamId;

            return {
                identifiers: {externalId, user: userId},
                details: {name: api.team_name}
            }
        },
        getCredentialDetails: async function(api, userId) {
            const workspaceInfo = await api.authTest();
            const isTeamUser = workspaceInfo['bot_user_id'];
            const externalId = isTeamUser ? get(workspaceInfo, 'team_id') : get(workspaceInfo, 'user_id');
            return {
                identifiers: { externalId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.authTest();
        },
    },
    env: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/slack`,
        scope: process.env.SLACK_SCOPE,
    }
};

module.exports = { Definition };
