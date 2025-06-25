const { checkRequiredParams } = require('@friggframework/core');
const express = require('express');
const Boom = require('@hapi/boom');
const { createAppHandler } = require('../../app');
const catchAsyncError = require('express-async-handler');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const { integrationFactory } = require('../../backend');

const router = express();

router.all('/api/demo*', requireLoggedInUser);

router.route('/api/demo/sample/:integrationId').get(
    catchAsyncError(async (req, res) => {
        const params = checkRequiredParams(req.params, ['integrationId']);
        const integration =
            await integrationFactory.getInstanceFromIntegrationId({
                integrationId: params.integrationId,
                userId: req.user.getUserId(),
            });
        const sampleData = await integration.getSampleData();
        res.json(sampleData);
    })
);

const handler = createAppHandler('HTTP Event: Demo', router);

module.exports = { handler, router };
