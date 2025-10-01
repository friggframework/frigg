const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const { loadAppDefinition } = require('../app-definition-loader');

const router = createIntegrationRouter();

router.route('/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

// Integration settings endpoint
router.route('/config/integration-settings').get(requireLoggedInUser, (req, res) => {
    const appDefinition = loadAppDefinition();

    const settings = {
        autoProvisioningEnabled: appDefinition.integration?.autoProvisioningEnabled ?? true,
        credentialReuseStrategy: appDefinition.integration?.credentialReuseStrategy ?? 'shared',
        allowUserManagedEntities: appDefinition.integration?.allowUserManagedEntities ?? true
    };

    res.json(settings);
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler, router };
