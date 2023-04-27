const Authenticator = require('@friggframework/test-environment/Authenticator');
const Api = require('../api/graph');
const config = require('../defaultConfig.json');

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
            expect(api.access_token).toBeDefined();
            expect(api.refresh_token).toBeDefined();
        });
        it('Should be able to refresh the token', async () => {
            const oldToken = api.access_token;
            const oldRefreshToken = api.refresh_token;
            await api.refreshAccessToken({ refresh_token: api.refresh_token });
            expect(api.access_token).toBeDefined();
            expect(api.access_token).not.toEqual(oldToken);
            expect(api.refresh_token).toBeDefined();
            expect(api.refresh_token).not.toEqual(oldRefreshToken);
        });
    });

    let tenantId;
    let userId;
    describe('Basic Identification Requests', () => {
        it('Should retrieve information about the user', async () => {
            const user = await api.getUser();
            expect(user).toBeDefined();
            userId = user.id;
        });
        it('Should retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            expect(org).toBeDefined();
            tenantId = org.id;
        });
    });


    let teamId;
    it('Get joined teams', async ()=> {
        api.setTenantId(tenantId);
        const joinedTeams = await api.getJoinedTeams();
        expect(joinedTeams).toHaveProperty('value');
        teamId = joinedTeams.value.slice(-1)[0].id;
    });



    let createChannelResponse;
    // skip channel creation tests to avoid private channel limitations
    // unskip at any time to test Channel creation behavior
    describe.skip('Channel Requests', () => {
        it('Should create channel', async () => {
            api.setTeamId(teamId);
            const body = {
                "displayName": `Test channel ${Date.now()}`,
                "description": "Test channel created by api.test",
                "membershipType": "private"
            }
            createChannelResponse = await api.createChannel(body);
            expect(createChannelResponse).toBeDefined();
        });
        it('Should add user to channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: [],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${userId}\')`
            };
            const response = await api.addUserToChannel(createChannelResponse.id, conversationMember);
            expect(response).toBeDefined();
        });
        it('List users in channel Request', async () => {
            const response = await api.listChannelMembers(createChannelResponse.id);
            expect(response).toBeDefined();
            expect(response.value[0].userId).toBe(userId)
        });
        it('Delete the created channel', async () => {
            const response = await api.deleteChannel(createChannelResponse.id);
            expect(response.status).toBe(204);
        });
    });

    describe('User App requests', ()=> {
        const externalAppId = 'd0f523b9-97e8-42d9-9e0a-d82da5ec3ed1'
        let appId;
        it('Should list matching apps in app catalog', async () => {
            const appResponse = await api.getAppCatalog({
                $filter: `externalId eq '${externalAppId}'`
            });
            expect(appResponse).toHaveProperty('value');
            expect(appResponse.value).toHaveLength(1);
            appId = appResponse.value[0].id;
        });
        it('Should install app', async () => {
            const installationResponse = await api.installAppForUser(userId, appId);
            expect(installationResponse).toBeDefined();
            // installation response is coming back as an empty string rather than a 201 status.
            //expect(installationResponse.status).toBe(201);
        });
        let teamsAppInstallationId;
        it('Should list installed apps', async () => {
            const allInstalledApps = await api.getInstalledAppsForUser(userId, {
                $expand: 'teamsApp,teamsAppDefinition'
            });


            const installedApps = await api.getInstalledAppsForUser(userId, {
                $filter: `teamsApp/id eq '${appId}'`,
                $expand: 'teamsApp,teamsAppDefinition'
            });
            expect(installedApps).toHaveProperty('value');
            teamsAppInstallationId = installedApps.value[0].id;
        });
        it('Should remove app', async () => {
            const deleteResponse = await api.removeAppForUser(userId, teamsAppInstallationId);
            expect(deleteResponse.status).toBe(204);
        });
    });

    describe('Team App requests', ()=> {
        const externalAppId = 'd0f523b9-97e8-42d9-9e0a-d82da5ec3ed1'
        let appId;
        it('Should list matching apps in app catalog', async () => {
            const appResponse = await api.getAppCatalog({
                $filter: `externalId eq '${externalAppId}'`
            });
            expect(appResponse).toHaveProperty('value');
            expect(appResponse.value).toHaveLength(1);
            appId = appResponse.value[0].id;
        });
        it('Should install app', async () => {
            // teamId grabbed from earlier test
            await api.setTeamId(teamId)
            const installationResponse = await api.installAppForTeam(teamId, appId);
            expect(installationResponse).toBeDefined();
            // installation response is coming back as an empty string rather than a 201 status.
            //expect(installationResponse.status).toBe(201);
        });
        let teamsAppInstallationId;
        it('Should list installed apps', async () => {
            const allInstalledApps = await api.getInstalledAppsForTeam(teamId, {
                $expand: 'teamsApp,teamsAppDefinition'
            });


            const installedApps = await api.getInstalledAppsForTeam(teamId, {
                $filter: `teamsApp/id eq '${appId}'`,
                $expand: 'teamsApp,teamsAppDefinition'
            });
            expect(installedApps).toHaveProperty('value');
            teamsAppInstallationId = installedApps.value[0].id;
        });
        it('Should remove app', async () => {
            const deleteResponse = await api.removeAppForTeam(teamId, teamsAppInstallationId);
            expect(deleteResponse.status).toBe(204);
        });
    });
});
