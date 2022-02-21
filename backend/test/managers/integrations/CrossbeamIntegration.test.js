require('../../utils/TestUtils');
const proxyquire = require('proxyquire').noCallThru();
const CrossbeamIntegrationManager = require('../../../src/managers/integrations/CrossbeamIntegrationManager');
const MockAPI = require('../../../src/modules/Crossbeam/mocks/apiMock');
const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');

chai.use(require('chai-url'));
chai.use(chaiAsPromised);

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

const MockedEntityManager = {
    getEntityManagerInstanceFromEntityId: async () => {
        return {
            getName: () => 'crossbeam',
            api: new MockAPI(),
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

const MockedCrossbeamIntegrationManager = proxyquire(
    '../../../src/managers/integrations/CrossbeamIntegrationManager',
    {
        '../../base/managers/LHIntegrationManager': MockedLHIntegrationManager,
    }
);

MockedCrossbeamIntegrationManager.integrationTypes = ['crossbeam'];
MockedCrossbeamIntegrationManager.integrationManagerClasses = [
    MockedCrossbeamIntegrationManager,
];

describe('Crossbeam Integration Manager', async () => {
    let integrationManager;
    before(async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'crossbeam',
        };
        integrationManager =
            await MockedCrossbeamIntegrationManager.createIntegration(
                entities,
                testUserId,
                config
            );

        integrationManager.delegate.should.equal(integrationManager);
        integrationManager.delegateTypes.should.have.length(1);
    });

    it('should get sample contact data', async () => {
        const response = await integrationManager.getSampleData();
        response.should.have.property('data');
    });
});
