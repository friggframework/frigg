const express = require('express');
const {
    createManagementApiRouter,
} = require('../../management-api/create-management-api-router');
const {
    createExtensionRoutesRouter,
} = require('../../extensions/route-mounter');
const { createAppHandler } = require('./../app-handler-helpers');

// The Management API (ADR-053): v2 under /api/v2, the deprecated v1 at the
// unprefixed paths (or 410 when managementApi.v1 is false).
//
// Built on first access, not at require time (friggframework/frigg#545,
// c40eca49): a host that presets the app definition (setAppDefinition, as
// provider-netlify's function entry points do) can require this module
// before or after doing so.
let router;
let handler;

function buildRouter() {
    const built = express.Router();
    built.use(createManagementApiRouter());

    // The OAuth provider's redirect target. Unversioned: it is neither part
    // of v1 nor v2, so it is never deprecated or disabled.
    built.route('/api/integrations/redirect/:appId').get((req, res) => {
        res.redirect(
            `${process.env.FRONTEND_URI}/redirect/${req.params.appId
            }?${new URLSearchParams(req.query)}`
        );
    });

    // App-level extension routes (appDefinition.extensions[].routes), each
    // behind the admin API key.
    built.use(createExtensionRoutesRouter());

    return built;
}

module.exports = {
    get router() {
        if (!router) router = buildRouter();
        return router;
    },
    get handler() {
        if (!handler) {
            handler = createAppHandler('HTTP Event: Auth', module.exports.router);
        }
        return handler;
    },
};
