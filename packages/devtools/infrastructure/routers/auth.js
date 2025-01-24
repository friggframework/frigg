const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const {
    moduleFactory,
    integrationFactory,
    IntegrationHelper,
} = require('./../backend-utils');

const router = createIntegrationRouter({
    factory: { moduleFactory, integrationFactory, IntegrationHelper },
    requireLoggedInUser,
    getUserId: (req) => req.user.getUserId(),
});

router.route('/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${
            req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler, router };
