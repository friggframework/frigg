const { IntegrationManager } = require('./integration-manager');
// const MockAPI = require('./mocks/apiMock');

const testUserId = 9001;

jest.mock('@friggframework/module-plugin', () => {
    return {
        Entity: class MockedEntity {
            static findById(id) {
                return {
                    _id: id,
                    user: testUserId,
                };
            }
        },
    };
});

jest.mock('@friggframework/integrations', () => {
    return {
        ...jest.requireActual('@friggframework/integrations'),
        Integration: class MockedIntegration {
            static create() {
                return {
                    entities: [{}, {}],
                };
            }
        },
    };
});

IntegrationManager.EntityManagerClass = {
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

IntegrationManager.integrationTypes = ['hubspot'];
IntegrationManager.integrationManagerClasses = [IntegrationManager];

describe.skip('HubSpot Integration Manager', () => {
    let integrationManager;
    beforeAll(async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'hubspot',
        };
        integrationManager = await IntegrationManager.createIntegration(
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
