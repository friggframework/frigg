const express = require('express');
const catchAsyncError = require('express-async-handler');
const {
    createReportingRepository,
} = require('./repositories/reporting-repository-factory');
const { ListIntegrationsReport } = require('./use-cases/list-integrations-report');

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
            res.json(
                await listIntegrationsReport.execute({ status, type, userId })
            );
        })
    );

    return router;
}

module.exports = { createReportingRouter, validateApiKey };
