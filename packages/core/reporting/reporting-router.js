const express = require('express');
const catchAsyncError = require('express-async-handler');
const {
    createReportingRepository,
} = require('./repositories/reporting-repository-factory');
const { ListIntegrationsReport } = require('./use-cases/list-integrations-report');

/**
 * Admin API key validation middleware.
 * Mirrors the db-migration.js pattern, but with a dedicated reporting key.
 */
const validateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-frigg-reporting-api-key'];

    if (!apiKey || apiKey !== process.env.REPORTING_API_KEY) {
        console.error('Unauthorized access attempt to reporting endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-reporting-api-key header required',
        });
    }

    next();
};

/**
 * Composition root for the reporting API. Wires the DB-specific repository
 * (via the factory) into the use case, gates every route behind the reporting
 * admin key, and exposes the versioned read-only endpoints.
 */
function createReportingRouter() {
    const reportingRepository = createReportingRepository();
    const listIntegrationsReport = new ListIntegrationsReport({
        reportingRepository,
    });

    const router = express.Router();
    router.use(validateApiKey);

    router.get('/api/v2/reports', (_req, res) => {
        res.json({ service: 'frigg-core-api', reports: ['integrations'] });
    });

    router.get(
        '/api/v2/reports/integrations',
        catchAsyncError(async (req, res) => {
            const { status, type, userId } = req.query;
            const result = await listIntegrationsReport.execute({
                status: status || undefined,
                type: type || undefined,
                userId: userId || undefined,
            });
            res.json(result);
        })
    );

    return router;
}

module.exports = { createReportingRouter, validateApiKey };
