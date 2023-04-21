const Authenticator = require('@friggframework/test-environment/Authenticator');
const Api = require('../api/graph');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();
describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        redirect_uri: process.env.TEAMS_REDIRECT_URI,
        scope: process.env.TEAMS_SCOPE,
        forceConsent: true,
        team_id: process.env.TEAMS_TEAM_ID
    };
    const api = new Api.graphApi(apiParams);

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

    let tenantId;
    let userId;
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUser();
            user.should.exist;
            userId = user.id;
        });
        it('Should retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            org.should.exist;
            tenantId = org.id;
        });
    });

    //api.setTenantId(tenantId);

    let teamId;
    it('Get joined teams', async ()=> {
        const joinedTeams = await api.getJoinedTeams();
        expect(joinedTeams).toHaveProperty('value');
        teamId = joinedTeams.value.slice(-1)[0].id;
    });



    let createChannelResponse;
    describe('Create Channel Request', () => {
        it('Should create channel', async () => {
            api.setTeamId(teamId);
            const body = {
                "displayName": `Test channel ${Date.now()}`,
                "description": "Test channel created by api.test",
                "membershipType": "private"
            }
            createChannelResponse = await api.createChannel(body);
            createChannelResponse.should.exist;
        });
    });

    describe('Add user to channel Request', () => {
        it('Should create channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: [],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${userId}\')`
            };
            const response = await api.addUserToChannel(createChannelResponse.id, conversationMember);
            response.should.exist;
        });
    });

    describe('List users in channel Request', () => {
        it('Should create channel', async () => {
            const response = await api.listChannelMembers(createChannelResponse.id);
            response.should.exist;
            expect(response.value[0].userId).toBe(userId)
        });
    });

    afterAll(async () => {
        const response = await api.deleteChannel(createChannelResponse.id);
        expect(response.status).toBe(204);
    });
});
