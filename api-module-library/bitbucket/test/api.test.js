require('dotenv').config();
const { Api } = require('../api');
const Authenticator = require("@friggframework/test-environment/Authenticator");

describe('BitBucket API Tests', () => {
    const apiParams = {
        client_id: process.env.BITBUCKET_CLIENT_ID,
        client_secret: process.env.BITBUCKET_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/bitbucket`
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = api.getAuthorizationUri();
        const response = await Authenticator.oauth2(url);
        await api.getTokenFromCode(response.data.code);
    });

    describe('OAuth Flow Tests', () => {
        it('Should generate a token', async () => {
            expect(api.access_token).toBeTruthy();
        });
    });

    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUserDetails();
            expect(user).toBeDefined();
        });

        it('Should retrieve information about the token', async () => {
            const tokenDetails = await api.getTokenIdentity();
            expect(tokenDetails.identifier).toBeDefined();
        });
    });

    describe('Repositories Test', () => {
        it('Should get all public repositories', async () => {
            const repositories = await api.getPublicRepos();
            expect(repositories).toBeDefined();
        });
    });
});