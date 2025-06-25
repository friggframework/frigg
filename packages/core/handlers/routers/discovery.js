const { createIntegrationDiscoveryRouter } = require('./integration-discovery');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');

const router = createIntegrationDiscoveryRouter({
    requireLoggedInUser,
    projectRoot: process.cwd()
});

const handler = createAppHandler('HTTP Event: Discovery', router);

module.exports = { handler, router };