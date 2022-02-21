require('../../utils/TestUtils');
const proxyquire = require('proxyquire').noCallThru();
const MarketoIntegrationManager = require('../../../src/managers/integrations/MarketoIntegrationManager');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(require('chai-url'));
chai.use(chaiAsPromised);

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

const MockedEntityManager = {
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

const MockedLHIntegrationManager = proxyquire(
    '../../../src/base/managers/LHIntegrationManager',
    {
        '../models/Entity': MockedEntity,
        '../models/Integration': MockedIntegration,
        '../../managers/entities/EntityManager': MockedEntityManager,
    }
);

const MockedMarketoIntegrationManager = proxyquire(
    '../../../src/managers/integrations/MarketoIntegrationManager',
    {
        '../../base/managers/LHIntegrationManager': MockedLHIntegrationManager,
    }
);

MockedMarketoIntegrationManager.integrationTypes = ['marketo'];
MockedMarketoIntegrationManager.integrationManagerClasses = [
    MockedMarketoIntegrationManager,
];

describe('Marketo Integration Manager', async () => {
    it('creates an integration', async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'marketo',
        };
        const integrationManager =
            await MockedMarketoIntegrationManager.createIntegration(
                entities,
                testUserId,
                config
            );

        integrationManager.delegate.should.equal(integrationManager);
        integrationManager.delegateTypes.should.have.length(1);
        integrationManager.delegateTypes.should.contain('EXAMPLE_EVENT');
    });

    it.skip('retrieves sample data', async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'marketo',
        };
        const integrationManager =
            await MockedMarketoIntegrationManager.createIntegration(
                entities,
                testUserId,
                config
            );
        const response = await integrationManager.retrieveSampleData(
            'lead details'
        );
        response.should.have.property('sampleData', true);
    });
});
