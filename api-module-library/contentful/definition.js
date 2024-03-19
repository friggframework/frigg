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
            const access_token = get(params.data, 'access_token');
            await api.setTokens({ access_token });
        },
        getEntityDetails: async function(api, callbackParams, tokenResponse, userId) {
            const entityDetails = await api.getTokenIdentity();
            const spacesResponse = await api.getSpaces();
            const spaces = spacesResponse.items.map(space => ( {
                id: space.sys.id,
                name: space.name
            }));
            return {
                identifiers: {externalId: entityDetails.identifier, user: userId},
                details: {
                    name: entityDetails.name,
                    spaces,
                    test: 'test',
                }
            }
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token'
            ],
            entity: [],
        },
        getCredentialDetails: async function(api, userId) {
            const userDetails = await api.getTokenIdentity();
            return {
                identifiers: { externalId: userDetails.identifier, user: userId },
                details: {}
            };
        },
        testAuthRequest: async function(api){
            return api.getTokenIdentity()
        },
    },
    env: {
        client_id: process.env.CONTENTFUL_CLIENT_ID,
        client_secret: process.env.CONTENTFUL_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/contentful`,
        scope: process.env.CONTENTFUL_SCOPE,
    }
};

module.exports = { Definition };
