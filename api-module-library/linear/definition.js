const {Api} = require('./api');
const { Credential } = require('./models/credential');
const { Entity } = require('./models/entity');
const {get} = require("@friggframework/assertions");
const config = require('./defaultConfig.json')

const Definition = {
    API: Api,
    getName: function() {return config.name},
    name: config.name,//maybe not required
    Credential,
    Entity,
    requiredAuthMethods: {
        getToken: async function(api, params){
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse) {
            const entityDetails = await api.getTokenIdentity();
            return {
                externalId: entityDetails.identifier,
                name: entityDetails.name,
            }
        },
        getCredentialDetails: async function(api) {
            const userDetails = await api.getTokenIdentity();
            const updatedToken = {
                auth_is_valid: true,
            };
            if (api.access_token) { updatedToken.access_token = api.access_token}
            if (api.refresh_token) { updatedToken.refresh_token = api.refresh_token}
            updatedToken.externalId = userDetails.identifier;
            return updatedToken;
        },
        apiParamsFromCredential: function(credential) {
            return {
                access_token: credential.access_token,
            }
        },
        testAuth: async function(api){
            return await api.UserDetails()
        }
    },
    env: {
        client_id: process.env.LINEAR_CLIENT_ID,
        client_secret: process.env.LINEAR_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/linear`,
        scope: process.env.LINEAR_SCOPE,
    }
};

module.exports = { Definition };