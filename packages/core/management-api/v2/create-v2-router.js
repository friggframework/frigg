const express = require('express');
const Boom = require('@hapi/boom');
const { API_VERSION_HEADER } = require('../error-response');

/**
 * Management API v2 router (ADR-053). Every response under /api/v2 carries
 * `Frigg-API-Version: 2`; an unknown /api/v2 path is a v2 404.
 */
function createManagementApiV2Router() {
    const router = express.Router();

    router.use('/api/v2', (_req, res, next) => {
        res.set(API_VERSION_HEADER, '2');
        next();
    });

    router.use('/api/v2', (req, _res, next) => {
        next(Boom.notFound(`No Management API v2 route for ${req.method} ${req.baseUrl}${req.path}`));
    });

    return router;
}

module.exports = { createManagementApiV2Router };
