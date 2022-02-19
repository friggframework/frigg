const HubSpotIntegrationManager = require('../../../src/managers/integrations/HubSpotIntegrationManager');
const MockAPI = require('../../../src/modules/HubSpot/mocks/apiMock');

const testUserId = 9001;

function MockedEntity() {
    return {
        get: (id) => {
            return {
                _id: id,
                user: testUserId,
            };
        },
    };
}

function MockedIntegration() {
    return {
        create: () => {
            return {
                entities: [{}, {}],
            };
        },
    };
}

jest.mock('@friggframework/models', () => {
    return {
        Entity: MockedEntity,
        Integration: MockedIntegration,
    };
});

HubSpotIntegrationManager.EntityManagerClass = {
    getEntityManagerInstanceFromEntityId: async () => {
        return {
            getName: () => 'hubspot',
            // instance: {
            //     isSet: true,
            //     api: MockAPI,
            // },
            api: new MockAPI(),
        };
    },
};

HubSpotIntegrationManager.integrationTypes = ['hubspot'];
HubSpotIntegrationManager.integrationManagerClasses = [
    HubSpotIntegrationManager,
];

describe('HubSpot Integration Manager', () => {
    let integrationManager;
    beforeAll(async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'hubspot',
        };
        integrationManager = await HubSpotIntegrationManager.createIntegration(
            entities,
            testUserId,
            config
        );

        expect(integrationManager.delegate).toBe(integrationManager);
        expect(integrationManager.delegateTypes).toHaveLength(1);
    });

    it('should get sample contact data', async () => {
        const response = await integrationManager.getSampleData();
        expect(response).toHaveProperty('data');
    });
});
