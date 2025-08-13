const { createIntegrationRouter } = require('@friggframework/core');
const { createAppHandler } = require('./../app-handler-helpers');
const {
    loadAppDefinition,
} = require('../app-definition-loader');
const { UserRepository } = require('../../user/user-repository');
const { GetUserFromBearerToken } = require('../../user/use-cases/get-user-from-bearer-token');

const { userConfig } = loadAppDefinition();
const userRepository = new UserRepository({ userConfig });
const getUserFromBearerToken = new GetUserFromBearerToken({
    userRepository,
    userConfig,
});

const router = createIntegrationRouter({
    getUserFromBearerToken,
});

router.route('/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler };
