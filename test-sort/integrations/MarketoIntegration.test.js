const MarketoIntegrationManager = require('../../../src/managers/integrations/MarketoIntegrationManager');

const testUserId = 9001;

function MockedEntity() {
    return {
        get: (id) => {
            return {
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
MarketoIntegrationManager.EntityManagerClass = {
    getEntityManagerInstanceFromEntityId: async () => {
        return {
            getName: () => 'marketo',
            instance: {
                api: {
                    getLeadDetails: () => ({ sampleData: true }),
                },
            },
        };
    },
};

MarketoIntegrationManager.integrationTypes = ['marketo'];
MarketoIntegrationManager.integrationManagerClasses = [
    MarketoIntegrationManager,
];

describe('Marketo Integration Manager', () => {
    it('creates an integration', async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'marketo',
        };
        const integrationManager =
            await MarketoIntegrationManager.createIntegration(
                entities,
                testUserId,
                config
            );

        expect(integrationManager.delegate).toBe(integrationManager);
        expect(integrationManager.delegateTypes).toHaveLength(1);
        expect(integrationManager.delegateTypes).toEqual(
            expect.arrayContaining(['EXAMPLE_EVENT'])
        );
    });

    it.skip('retrieves sample data', async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'marketo',
        };
        const integrationManager =
            await MarketoIntegrationManager.createIntegration(
                entities,
                testUserId,
                config
            );
        const response = await integrationManager.retrieveSampleData(
            'lead details'
        );
        expect(response).toHaveProperty('sampleData', true);
    });
});
