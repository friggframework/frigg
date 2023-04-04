const Api = require('../api/botFramework');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();

describe.skip(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        redirect_uri: `${process.env.REDIRECT_URI}/microsoft-teams`,
        team_id: process.env.TEAMS_ID,
        tenant_id: process.env.TENANT_ID
    };

    let api;

    beforeAll(async () => {
        api = new Api.botFrameworkApi(apiParams);
        await api.getTokenFromClientCredentials();
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an access_token', async () => {
            api.access_token.should.exist;
        });
    });

    describe('Team Member Requests', () => {
        it('Should retrieve information about the members of the team', async () => {
            const teamChannelId = '19:N6cQDh5RfdWomP_UJ6CA7tKlsvMkaCEN-PrHWtAvwPk1@thread.tacv2';
            const members = await api.getTeamMembers(teamChannelId);
            members.should.exist;
        });
    });
});
