const { createFriggBackend } = require('@friggframework/core');
const HubSpotIntegration = require('./src/integrations/HubSpotIntegration');

const appDefinition = {
    integrations:[
        HubSpotIntegration,
    ],
    user: {
        password: true
    }
}
const backend = createFriggBackend(appDefinition);
module.exports = {...backend}
