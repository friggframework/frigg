const express = require('express');
const { createAppHandler } = require('../app-handler-helpers');
const { checkRequiredParams } = require('@friggframework/core');
const { User } = require('../backend-utils');
const catchAsyncError = require('express-async-handler');

const router = express();

// Admin API key middleware
const validateAdminApiKey = (req, res, next) => {
    // Allow access in local development (when NODE_ENV is not production)
    if (process.env.NODE_ENV !== 'production') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
        console.error('Unauthorized access attempt to admin endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - Admin API key required',
        });
    }

    next();
};

// define the login endpoint (keeping /user/login for backward compatibility)
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

// RESTful login endpoint
router.route('/users/login').post(
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

// RESTful create endpoint
router.route('/users').post(
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

// Admin endpoints moved to /api/admin/users in admin.js router

const handler = createAppHandler('HTTP Event: User', router);

module.exports = { handler, router };
