const {IntegrationFactory, IntegrationHelper} = require('./integration-factory');
const User = require('./integration-user');

function createFriggBackend(appDefinition) {
    const {integrations = [], user=null} = appDefinition
    const integrationFactory = new IntegrationFactory(integrations);
    if (user) {
        if (user.usePassword) {
            User.usePassword = true;
        }
        if (user.primary === 'organization') {
            User.primary = User.OrganizationUser
        }
        if (user.individualUserRequired !== undefined) {
            User.individualUserRequired = user.individualUserRequired
        }
        if (user.organizationUserRequired !== undefined) {
            User.organizationUserRequired = user.organizationUserRequired
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
