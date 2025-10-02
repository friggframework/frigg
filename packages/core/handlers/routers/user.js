const express = require('express');
const { createAppHandler } = require('../app-handler-helpers');
const { checkRequiredParams } = require('@friggframework/core');
const catchAsyncError = require('express-async-handler');
const {
    createUserRepository,
} = require('../../user/repositories/user-repository-factory');
const {
    CreateIndividualUser,
} = require('../../user/use-cases/create-individual-user');
const { LoginUser } = require('../../user/use-cases/login-user');
const {
    CreateTokenForUserId,
} = require('../../user/use-cases/create-token-for-user-id');
const { loadAppDefinition } = require('../app-definition-loader');

const router = express();

// Initialize repositories and use cases
const { userConfig } = loadAppDefinition();
const userRepository = createUserRepository({ userConfig });
const createIndividualUser = new CreateIndividualUser({
    userRepository,
    userConfig,
});
const loginUser = new LoginUser({
    userRepository,
    userConfig,
});
const createTokenForUserId = new CreateTokenForUserId({ userRepository });

// Login endpoint
router.route('/users/login').post(
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

// Create user endpoint
router.route('/users').post(
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
