const express = require('express');
const UserManager = require('../managers/UserManager');
const RouterUtil = require('../utils/RouterUtil');
const catchAsyncError = require('express-async-handler');

const router = express();

// define the login endpoint
router.route('/user/login').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = RouterUtil.checkRequiredParams(
            req.body,
            ['username', 'password']
        );
        const userManager = await UserManager.loginUser({ username, password });
        const token = await userManager.createUserToken(120);
        res.status(201);
        res.json({ token });
    })
);

router.route('/user/create').post(
    catchAsyncError(async (req, res) => {
        const { username, password } = RouterUtil.checkRequiredParams(
            req.body,
            ['username', 'password']
        );
        const userManager = await UserManager.createIndividualUser({
            username,
            password,
        });
        const token = await userManager.createUserToken(120);
        res.status(201);
        res.json({ token });
    })
);

module.exports = router;
