const express = require('express');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const RouterUtil = require('../utils/RouterUtil');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const IntegrationManager = require('../managers/integrations/IntegrationManager');

const router = express();

router.all('/api/demo*', requireLoggedInUser);

router.route('/api/demo/sample/:integrationId').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, [
            'integrationId',
        ]);
        const integrationManagerInstance =
            await IntegrationManager.getInstanceFromIntegrationId({
                integrationId: params.integrationId,
                userId: req.userManager.getUserId(),
            });

        const sampleData = await integrationManagerInstance.getSampleData();
        res.json(sampleData);
    })
);

module.exports = router;
