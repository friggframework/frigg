require('../../utils/TestUtils');
const proxyquire = require('proxyquire').noCallThru();
const HubSpotIntegrationManager = require('../../../src/managers/integrations/HubSpotIntegrationManager');
const MockAPI = require('../../../src/modules/HubSpot/mocks/apiMock');
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
            getName: () => 'hubspot',
            // instance: {
            //     isSet: true,
            //     api: MockAPI,
            // },
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

const MockedHubSpotIntegrationManager = proxyquire(
    '../../../src/managers/integrations/HubSpotIntegrationManager',
    {
        '../../base/managers/LHIntegrationManager': MockedLHIntegrationManager,
    }
);

MockedHubSpotIntegrationManager.integrationTypes = ['hubspot'];
MockedHubSpotIntegrationManager.integrationManagerClasses = [
    MockedHubSpotIntegrationManager,
];

describe('HubSpot Integration Manager', async () => {
    let integrationManager;
    before(async () => {
        const entities = ['primaryEntityId', 'targetEntityId'];
        const config = {
            type: 'hubspot',
        };
        integrationManager =
            await MockedHubSpotIntegrationManager.createIntegration(
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
