const { createMockIntegration, createMockApiObject } = require('@friggframework/devtools');
const { connectToDatabase, disconnectFromDatabase } = require('@friggframework/core');
const HubSpotIntegration = require('../../src/integrations/HubSpotIntegration');
const hubspotMocks = require('../mocks/hubspotMocks');


const setupMockIntegration = async () => {
    const integration = await createMockIntegration(HubSpotIntegration);
    integration.target = integration.hubspot;
    integration.target.api = createMockApiObject(jest, integration.hubspot.api, hubspotMocks);
    return integration;
}

describe('HubSpot Integration Tests', () => {
    let integration;
    beforeAll(async () => {
        await connectToDatabase();
    });

    afterAll(async () => {
        await disconnectFromDatabase();
    })

    beforeAll(async () => {
        integration = await setupMockIntegration();
    });

    it('onCreate should define integration config', async () => {
        integration.record.save = jest.fn().mockResolvedValue({});
        const response = await integration.onCreate();
        expect(response.status).toBe('ENABLED');
    });

    describe('Sample Data Test', () => {
        it('Should retrieve action options', async () => {
            const sampleData = await integration.getSampleData();
            expect(sampleData).toBeDefined();
        });

    });

    describe('ReceiveNotification tests', () => {
        let actionData;
        it('Should retrieve action options', async () => {
            const deals = await integration.notify('SEARCH_DEALS');
            expect(deals).toBeDefined();
        });
    });
});
