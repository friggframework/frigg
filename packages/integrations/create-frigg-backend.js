const {IntegrationFactory, IntegrationHelper} = require('./integration-factory');
const User = require('./integration-user');
function createFriggBackend(appDefinition) {
    const {integrations = [], user=null} = appDefinition
    const integrationFactory = new IntegrationFactory(integrations);
    if (user) {
        if (user.usePassword) {
            User.usePassword = true;
        }

    }
    const backend = {
        integrationFactory,
        moduleFactory: integrationFactory.moduleFactory,
        IntegrationHelper,
        User: User
    }
    return backend
}

module.exports = { createFriggBackend }
