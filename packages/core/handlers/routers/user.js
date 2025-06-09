const express = require('express');
const { createAppHandler } = require('../app-handler-helpers');
const { checkRequiredParams } = require('@friggframework/core');
const { User } = require('../../user/user');
const { UserRepository } = require('../../user/user-repository');
const { UserFactory } = require('../../user/user-factory');
const {
    CreateIndividualUser,
} = require('../../user/use-cases/create-individual-user');
const { LoginUser } = require('../../user/use-cases/login-user');
const {
    CreateTokenForUserId,
} = require('../../user/use-cases/create-token-for-user-id');
const catchAsyncError = require('express-async-handler');
const { loadAppDefinition } = require('../backend-utils');

const router = express();

const appDefinition = loadAppDefinition();
const userRepository = new UserRepository({ userDefinition: appDefinition.userConfig });
const createIndividualUser = new CreateIndividualUser({
    userRepository,
    userConfig: appDefinition.userConfig,
});
const loginUser = new LoginUser({
    userRepository,
    userConfig: appDefinition.userConfig,
});
const createTokenForUserId = new CreateTokenForUserId({ userRepository });

// define the login endpoint
router.route('/user/login').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);
        const user = await loginUser.execute({ username, password });
        const token = await createTokenForUserId.execute(user.getId(), 120);
        res.status(201);
        res.json({ token });
    })
);

router.route('/user/create').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);

        const user = await createIndividualUser.execute({
            username,
            password,
        });
        const token = await createTokenForUserId.execute(user.getId(), 120);
        res.status(201);
        res.json({ token });
    })
);

const handler = createAppHandler('HTTP Event: User', router);

module.exports = { handler, router };
