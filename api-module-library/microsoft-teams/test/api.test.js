const {Api} = require('../api/api');

describe('Test of cross API functionality', () => {
    const apiParams = {
        client_id: process.env.TEAMS_CLIENT_ID,
        client_secret: process.env.TEAMS_CLIENT_SECRET,
        team_id: process.env.TEAMS_TEAM_ID,
        tenant_id: process.env.TEAMS_TENANT_ID,
        scope: process.env.TEAMS_CRED_SCOPE,
    };
    const api = new Api(apiParams);

    beforeAll(async () => {
        await api.graphApi.getTokenFromClientCredentials();
        await api.botFrameworkApi.getTokenFromClientCredentials();
    });
    describe('OAuth Flow Tests', () => {
        it('Should generate an access_token', async () => {
            expect(api.graphApi.access_token).toBeDefined();
            expect(api.botFrameworkApi.access_token).toBeDefined();
        });
    });

    describe('Conversation reference generation tests', () => {
        let convRef;
        const testEmail = 'michael.webber@sklzt.onmicrosoft.com'
        it('Should create the conversation references', async () => {
            convRef = await api.createConversationReferences();
            expect(convRef).toBeDefined();
            expect(convRef[testEmail]).toBeDefined();
        });


        it('Should send a proactive message from the bot', async () => {
            await api.botApi.sendProactive(testEmail, "hello from api.test.js!");
        })
    });
});
