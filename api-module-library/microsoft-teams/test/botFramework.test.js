const Api = require('../api/botFramework');
const config = require('../defaultConfig.json');
const chai = require('chai');
const should = chai.should();

describe(`${config.label} API Tests`, () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        service_url: process.env.TEAMS_SERVICE_URL

    };

    const api = new Api.botFrameworkApi(apiParams);

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
            const teamChannelId = '19:0cdx-UsvOXLsr6Y2y3C5f7oCJsRGWjTf_xM77aegNYY1@thread.tacv2';
            const members = await api.getTeamMembers(teamChannelId);
            members.should.exist;
        });
    });
});
