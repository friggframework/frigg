const { Api } = require('../api/botFramework');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();

describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        redirect_uri: process.env.TEAMS_REDIRECT_URI,
        team_id: process.env.TEAMS_ID,
        tenant_id: process.env.TENANT_ID
    };

    const api = new Api(apiParams);

    beforeAll(async () => {
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
