const {IntegrationFactory, IntegrationHelper} = require('./integration-factory');

function createFriggBackend(integrations) {
    const integrationFactory = new IntegrationFactory(integrations);

    const backend = {
        integrationFactory,
        moduleFactory: integrationFactory.moduleFactory,
        IntegrationHelper
    }
    return backend
}

module.exports = { createFriggBackend }
