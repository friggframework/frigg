const Authenticator = require('@friggframework/test-environment/Authenticator');
const Api = require('../api/graph');
const config = require('../defaultConfig.json');

describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        scope: process.env.TEAMS_CRED_SCOPE,
        forceConsent: false
    };
    const api = new Api.graphApi(apiParams);

    beforeAll(async () => {
        await api.getTokenFromClientCredentials();
    });
    describe('OAuth Flow Tests', () => {
        it('Generate an access_token', async () => {
            expect(api.access_token).toBeDefined();
        });
    });

    describe('Basic Identification Requests', () => {
        it('Retrieve information about the Organization', async () => {
            const org = await api.getOrganization();
            expect(org).toBeDefined();
        });
    });

    describe('Retrieve teams for tenant/org', () => {
        it('Retrieve a list of groups/teams', async () => {
            const teams = await api.getTeams();
            expect(teams).toBeDefined();
        });
    });


    const mwebberUserId = 'c1cb384d-8a26-464e-8fe3-7117e5fd7918'
    let createChannelResponse;
    describe('Channel Requests', () => {
        it('Retrieve a list of channels for a team', async () => {
            const channels = await api.getChannels();
            expect(channels).toBeDefined();
        });

        // skip private channel creation due to private channel number limits
        it.skip('Create private channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: ['owner'],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${mwebberUserId}\')`
            };
            const body = {
                "displayName": `Test channel ${Date.now()}`,
                "description": "Test channel created by api.test",
                "membershipType": "private",
                "members":
                    [
                        conversationMember
                    ]
            };
            const createChannelResponse = await api.createChannel(body);
            expect(createChannelResponse).toBeDefined();
        });

        it('Create channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: ['owner'],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${mwebberUserId}\')`
            };
            const body = {
                "displayName": `Test channel ${Date.now()}`,
                "description": "Test channel created by api.test",
                "membershipType": "standard",
                "members":
                    [
                        conversationMember
                    ]
            };
            createChannelResponse = await api.createChannel(body);
            expect(createChannelResponse).toBeDefined();
        });

        let privateChannel;
        it('Retrieve all private channels for a team', async () => {
            const channels = await api.getChannels({$filter: "membershipType eq 'private'"});
            expect(channels).toBeDefined();
            expect(channels.value.length).toBeGreaterThan(0);
            privateChannel = channels.value[0];
        });

        it('Add user to channel', async () => {
            const conversationMember = {
                '@odata.type': '#microsoft.graph.aadUserConversationMember',
                roles: [],
                'user@odata.bind': `https://graph.microsoft.com/v1.0/users(\'${mwebberUserId}\')`
            };
            const response = await api.addUserToChannel(privateChannel.id, conversationMember);
            expect(response).toBeDefined();
        });

        it('Should list users in channel', async () => {
            const response = await api.listChannelMembers(createChannelResponse.id);
            expect(response).toBeDefined();
            //expect(response.value).toContainEqual(expect.objectContaining({userId: mwebberUserId}))
        });

        it('Should delete the channel', async () => {
            const response = await api.deleteChannel(createChannelResponse.id);
            expect(response.status).toBe(204);
        });
    });

    describe('App info, installation, deletion', () => {
        const appExternalId = 'd0f523b9-97e8-42d9-9e0a-d82da5ec3ed1';
        let teamId = '';
        let appInternalId = '';
        let appInstallationId = '';

        beforeAll(async () => {
            const teams = await api.getTeams();
            teamId = teams.value.slice(-1)[0].id;
        })

        it('Should retrieve app info', async ()=> {
            const response = await api.getAppCatalog();
            expect(response.value.length).toBeDefined();
            expect(response.value.length).toBeGreaterThan(10);
        })
        it('Should filter for specific app', async () => {
            // can't figure out why the filter isn't working but this is not needed at this time
            const response = await api.getAppCatalog({
                $filter: `externalId eq '${appExternalId}'`
            });
            expect(response.value).toHaveLength(1);
            appInternalId = response.value[0].id;
        })

        it('Should install app in test team', async () => {
            const response = await api.installAppForTeam(teamId, appInternalId);
            expect(response.status).toEqual(201);
        })
        it('Should retrieve details about installed app', async () => {
            const response = await api.getInstalledAppsForTeam(teamId, {
                $filter: `teamsApp/id eq '${appInternalId}'`,
                $expand: 'teamsApp,teamsAppDefinition'
            });
            expect(response.value).toHaveLength(1);
            appInstallationId = response.value[0].id;
        })
        it('Should delete app in test team', async () => {
            const response = await api.removeAppForTeam(teamId, appInstallationId);
            expect(response.status).toEqual(204);
        })

    });
});
