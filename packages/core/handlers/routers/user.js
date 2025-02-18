const express = require('express');
const { createAppHandler } = require('../app-handler-helpers');
const { checkRequiredParams } = require('@friggframework/core');
const { User } = require('../backend-utils');
const catchAsyncError = require('express-async-handler');

const router = express();

// define the login endpoint
router.route('/user/login').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = checkRequiredParams(req.body, [
            'username',
            'password',
        ]);
        const user = await User.loginUser({ username, password });
        const token = await user.createUserToken(120);
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
        const user = await User.createIndividualUser({
            username,
            password,
        });
        const token = await user.createUserToken(120);
        res.status(201);
        res.json({ token });
    })
);

const handler = createAppHandler('HTTP Event: User', router);

module.exports = { handler, router };
