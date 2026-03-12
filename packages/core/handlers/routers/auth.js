const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const { loadAppDefinition } = require('../app-definition-loader');

let _router;
let _handler;

function ensureRouter() {
    if (!_router) {
        _router = createIntegrationRouter();

        _router
            .route('/api/integrations/redirect/:appId')
            .get((req, res) => {
                res.redirect(
                    `${process.env.FRONTEND_URI}/redirect/${
                        req.params.appId
                    }?${new URLSearchParams(req.query)}`
                );
            });

        // Integration settings endpoint
        _router
            .route('/config/integration-settings')
            .get(requireLoggedInUser, (req, res) => {
                const appDefinition = loadAppDefinition();

                const settings = {
                    autoProvisioningEnabled:
                        appDefinition.integration
                            ?.autoProvisioningEnabled ?? true,
                    credentialReuseStrategy:
                        appDefinition.integration
                            ?.credentialReuseStrategy ?? 'shared',
                    allowUserManagedEntities:
                        appDefinition.integration
                            ?.allowUserManagedEntities ?? true,
                };

                res.json(settings);
            });
    }
    return _router;
}

module.exports = {
    get router() {
        return ensureRouter();
    },
    get handler() {
        if (!_handler) {
            _handler = createAppHandler('HTTP Event: Auth', ensureRouter());
        }
        return _handler;
    },
};
