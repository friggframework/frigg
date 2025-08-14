const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');

const router = createIntegrationRouter();

router.route('/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler };
