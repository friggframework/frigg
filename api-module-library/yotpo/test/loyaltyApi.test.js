const { mockApi } = require('@friggframework/test-environment/mock-api');
const { loyaltyApi } = require('../api/loyaltyApi');
const MockedApi = mockApi(loyaltyApi, {
    authenticationMode: 'manual',
});

describe('Yotpo Loyalty API', () => {
    beforeAll(async function () {
        await MockedApi.initialize();
    });

    afterAll(async function () {
        await MockedApi.clean();
    });
    describe('Nested', () => {
        it('tests a nice thing', async () => {
            const api = await MockedApi.mock();
            api.setApiKey(process.env.YOTPO_LOYALTY_API_KEY);
            api.setGuid(process.env.YOTPO_LOYALTY_GUID);
            const campaigns = await api.listActiveCampaigns();
            expect(campaigns.length).toEqual(2);
        });
        it('tests a only thing', async () => {
            const api = await MockedApi.mock();
            api.setApiKey(process.env.YOTPO_LOYALTY_API_KEY);
            api.setGuid(process.env.YOTPO_LOYALTY_GUID);
            const campaigns = await api.listActiveCampaigns();
            expect(campaigns.length).toEqual(2);
        });
    });
});
