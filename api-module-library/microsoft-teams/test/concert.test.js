const {bot} = require('bot');
const {Api} = require('../api/api');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();

describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        scope: process.env.TEAMS_CRED_SCOPE,
        service_url: process.env.TEAMS_SERVICE_URL

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
            const org = await api.graphApi.getOrganization();
            org.should.exist;
            const teams = await api.graphApi.getGroups();
            teams.should.exist;
            // team could be selected from these, hard-coding for now
            const teamChannelId = '19:RYVw9QYyjzcX_RQPt7Yy7g1nVsBQ4UX92tZYNoNAvsk1@thread.tacv2';
            const members = await api.botFrameworkApi.getTeamMembers(teamChannelId);
            members.should.exist;
            // const conversationReferences = {};
            // api.botApi.conversationReferences = conversationReferences;
            const resp = await api.botApi.setConversationReferenceFromMembers(members.members);
            resp.should.exist;
            await api.botApi.sendProactive('michael.webber@sklzt.onmicrosoft.com', 'super test!');
        });
    });
});
