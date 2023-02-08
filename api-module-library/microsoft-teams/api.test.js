const Authenticator = require('@friggframework/test-environment/Authenticator');
const { Api } = require('./api');
const config = require('./defaultConfig.json');
const chai = require('chai');
const should = chai.should();
describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        redirect_uri: process.env.TEAMS_REDIRECT_URI,
        scope: process.env.TEAMS_SCOPE,
        forceConsent: true,
        team_id: process.env.TEAMS_ID
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        const url = await api.getAuthUri();
        const response = await Authenticator.oauth2(url);
        const baseArr = response.base.split('/');
        response.entityType = baseArr[baseArr.length - 1];
        delete response.base;

        await api.getTokenFromCode(response.data.code);
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an access_token', async () => {
            api.access_token.should.exist;
            api.refresh_token.should.exist;
        });
        it('Should be able to refresh the token', async () => {
            const oldToken = api.access_token;
            const oldRefreshToken = api.refresh_token;
            await api.refreshAccessToken({ refresh_token: api.refresh_token });
            api.access_token.should.exist;
            api.access_token.should.not.equal(oldToken);
            api.refresh_token.should.exist;
            api.refresh_token.should.not.equal(oldRefreshToken);
        });
    });
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUser();
            user.should.exist;
        });
        it('Should retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            org.should.exist;
        });
    });

    let createChannelResponse;
    describe('Create Channel Request', () => {
        it('Should create channel', async () => {
            const body = {
                "displayName": `Test channel ${Date.now()}`,
                "description": "Test channel created by api.test",
                "membershipType": "private"
            }
            createChannelResponse = await api.createChannel(body);
            createChannelResponse.should.exist;
        });
    });

    const mwebberUserId = 'c1cb384d-8a26-464e-8fe3-7117e5fd7918'
    describe('Add user to channel Request', () => {
        it('Should create channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: [],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${mwebberUserId}\')`
            };
            const response = await api.addUserToChannel(createChannelResponse.id, conversationMember);
            response.should.exist;
        });
    });

    describe('List users in channel Request', () => {
        it('Should create channel', async () => {
            const response = await api.listChannelMembers(createChannelResponse.id);
            response.should.exist;
            expect(response.value[0].userId).toBe(mwebberUserId)
        });
    });

    afterAll(async () => {
        const response = await api.deleteChannel(createResponse.id);
        expect(response.status).toBe(204);
    });
});
