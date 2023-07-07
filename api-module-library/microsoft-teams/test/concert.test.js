const { bot } = require('bot');
const { Api } = require('../api/api');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();
const {
    CardFactory,
    MessageFactory,
    TeamsInfo,
    TurnContext,
} = require('botbuilder');

describe(`Concert tests stringing together APIs`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        scope: process.env.TEAMS_CRED_SCOPE,
        service_url: process.env.TEAMS_SERVICE_URL,
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        await api.graphApi.getTokenFromClientCredentials();
        await api.botFrameworkApi.getTokenFromClientCredentials();
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an access_token', async () => {
            api.graphApi.access_token.should.exist;
            api.botFrameworkApi.should.exist;
        });
    });
    describe('Concert requests', () => {
        it('Should retrieve team member details, create refs, and send message', async () => {
            let appId = 'f9ee9c3c-60ce-4d0f-a24b-fce329573b3c';
            const org = await api.graphApi.getOrganization();
            org.should.exist;

            const teams = await api.graphApi.getTeams();
            teams.should.exist;
            // team could be selected from these, hard-coding for now
            const team = teams.value.find((t) => t.displayName === 'MSFT');
            // install on the team
            // first check if installed
            const previousInstallation =
                await api.graphApi.getInstalledAppsForTeam(team.id, {
                    $filter: `teamsApp/id eq '${appId}'`,
                    $expand: 'teamsAppDefinition',
                });
            if (previousInstallation.value.length > 0)
                await api.graphApi.removeAppForTeam(
                    team.id,
                    previousInstallation.value[0].id
                );
            const secondPreviousInstallation =
                await api.graphApi.getInstalledAppsForTeam(team.id, {
                    $filter: `teamsApp/id eq '${appId}'`,
                    $expand: 'teamsAppDefinition',
                });

            // install if not
            if (secondPreviousInstallation.value.length === 0) {
                const installation = await api.graphApi.installAppForTeam(
                    team.id,
                    appId
                );
            }
            api.graphApi.setTeamId(team.id);
            const teamChannel = await api.graphApi.getPrimaryChannel();
            const teamMembers = await api.botFrameworkApi.getTeamMembers(
                teamChannel.id
            );

            const references = await api.createConversationReferences(team.id);
            const cardStuff = CardFactory.adaptiveCard(testCard);
            await api.botApi.sendProactive('sean@sklzt.onmicrosoft.com', {
                attachments: [cardStuff],
            });
        });
    });
});

const testCard = {
    type: 'AdaptiveCard',
    body: [
        {
            type: 'TextBlock',
            size: 'Medium',
            weight: 'Bolder',
            text: 'Workflow Launch Notification',
        },
        {
            type: 'ColumnSet',
            columns: [
                {
                    type: 'Column',
                    items: [
                        {
                            type: 'Image',
                            style: 'Person',
                            url: 'https://ok14static.oktacdn.com/bc/image/fileStoreRecord?id=fs0fs5r7zHewTdhKd696',
                            size: 'Small',
                        },
                    ],
                    width: 'auto',
                },
                {
                    type: 'Column',
                    items: [
                        {
                            type: 'TextBlock',
                            weight: 'Bolder',
                            text: 'Ironclad Bot',
                            wrap: true,
                        },
                        {
                            type: 'TextBlock',
                            spacing: 'None',
                            text: 'Created {{DATE(2023-04-10T06:08:39Z,SHORT)}}',
                            isSubtle: true,
                            wrap: true,
                        },
                    ],
                    width: 'stretch',
                },
            ],
        },
        {
            type: 'TextBlock',
            text: '✍️ A new workflow was launched with you as a participant:',
            wrap: true,
        },
        {
            type: 'ColumnSet',
            columns: [
                {
                    type: 'Column',
                    width: 'auto',
                    items: [
                        {
                            type: 'FactSet',
                            seperator: true,
                            facts: [
                                {
                                    title: 'Stage:',
                                    value: 'Review',
                                    seperator: true,
                                },
                                {
                                    title: 'Contract Type:',
                                    value: 'Data Processing Addendum',
                                },
                                {
                                    title: 'Creator:',
                                    value: 'Jon Smith (jon.smith@example.com)',
                                },
                            ],
                        },
                    ],
                },
                {
                    type: 'Column',
                    width: 'auto',
                    items: [
                        {
                            type: 'FactSet',
                            facts: [
                                {
                                    title: 'Submitted:',
                                    value: 'Apr 9',
                                },
                                {
                                    title: 'Participants:',
                                    value: '- Sean Matthews (sean.matthews@lefthook.co)\n - Test Participant (test.participant@example.com)',
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
};
