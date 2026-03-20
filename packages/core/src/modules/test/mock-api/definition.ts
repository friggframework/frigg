import 'dotenv/config';
import { Api } from './api';
import { get } from '../../../assertions';

const config = { name: 'anapi' };

export const Definition = {
    API: Api,
    getAuthorizationRequirements: () => ({
        url: 'http://localhost:3000/redirect/anapi',
        type: 'oauth2',
    }),
    getName: function () { return config.name; },
    moduleName: config.name,
    modelName: 'AnApi',
    requiredAuthMethods: {
        getToken: async function (api: any, params: any) {
            const code = get(params.data, 'code');
            return api.getTokenFromCode(code);
        },
        getEntityDetails: async function (api: any, _callbackParams: any, _tokenResponse: any, userId: string) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId, userId },
                details: { name: userDetails.hub_domain },
            };
        },
        apiPropertiesToPersist: {
            credential: [
                'access_token', 'refresh_token'
            ],
            entity: [],
        },
        getCredentialDetails: async function (api: any, userId: string) {
            const userDetails = await api.getUserDetails();
            return {
                identifiers: { externalId: userDetails.portalId, userId },
                details: {}
            };
        },
        testAuthRequest: async function (api: any) {
            return api.getUserDetails();
        },
    },
    env: {
        client_id: 'test',
        client_secret: 'test',
        scope: 'test',
        redirect_uri: `http://localhost:3000/redirect/anapi`,
    }
};
