const express = require('express');
const { createAppHandler } = require('../app-handler-helpers');
const { checkRequiredParams } = require('@friggframework/core');
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
const catchAsyncError = require('express-async-handler');
const { loadAppDefinition } = require('../app-definition-loader');

const router = express();

// Lazy-initialized repositories and use cases (deferred until first request)
let _userRepository, _createIndividualUser, _loginUser, _createTokenForUserId;

function ensureInitialized() {
    if (!_userRepository) {
        const { userConfig } = loadAppDefinition();
        _userRepository = createUserRepository();
        _createIndividualUser = new CreateIndividualUser({
            userRepository: _userRepository,
            userConfig,
        });
        _loginUser = new LoginUser({
            userRepository: _userRepository,
            userConfig,
        });
        _createTokenForUserId = new CreateTokenForUserId({
            userRepository: _userRepository,
        });
    }
}

// Lazy initialization middleware — runs once on first request
router.use((req, res, next) => {
    ensureInitialized();
    next();
});

// define the login endpoint
router.route('/user/login').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);
        const user = await _loginUser.execute({ username, password });
        const token = await _createTokenForUserId.execute(user.getId(), 120);
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

        const user = await _createIndividualUser.execute({
            username,
            password,
        });
        const token = await _createTokenForUserId.execute(user.getId(), 120);
        res.status(201);
        res.json({ token });
    })
);

const handler = createAppHandler('HTTP Event: User', router);

module.exports = { handler, router };
