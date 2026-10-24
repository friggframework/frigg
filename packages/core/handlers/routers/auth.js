const express = require('express');
const {
    createManagementApiRouter,
} = require('../../management-api/create-management-api-router');
const { createAppHandler } = require('./../app-handler-helpers');

// The Management API (ADR-053): v2 under /api/v2, the deprecated v1 at the
// unprefixed paths (or 410 when managementApi.v1 is false).
const router = express.Router();
router.use(createManagementApiRouter());

// The OAuth provider's redirect target. Unversioned: it is neither part of
// v1 nor v2, so it is never deprecated or disabled.
router.route('/api/integrations/redirect/:appId').get((req, res) => {
    res.redirect(
        `${process.env.FRONTEND_URI}/redirect/${req.params.appId
        }?${new URLSearchParams(req.query)}`
    );
});

const handler = createAppHandler('HTTP Event: Auth', router);

module.exports = { handler, router };
