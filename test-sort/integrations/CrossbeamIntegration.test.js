const CrossbeamIntegrationManager = require('../../../src/managers/integrations/CrossbeamIntegrationManager');
const MockAPI = require('../../../src/modules/Crossbeam/mocks/apiMock');

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

CrossbeamIntegrationManager.EntityManagerClass = {
    getEntityManagerInstanceFromEntityId: async () => {
        return {
            getName: () => 'crossbeam',
            api: new MockAPI(),
        };
    },
};

CrossbeamIntegrationManager.integrationTypes = ['crossbeam'];
CrossbeamIntegrationManager.integrationManagerClasses = [
    CrossbeamIntegrationManager,
];

describe('Crossbeam Integration Manager', () => {
    let integrationManager;
    beforeAll(async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'crossbeam',
        };
        integrationManager =
            await CrossbeamIntegrationManager.createIntegration(
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
