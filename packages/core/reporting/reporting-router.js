const express = require('express');
const catchAsyncError = require('express-async-handler');
const {
    createReportingRepository,
} = require('./repositories/reporting-repository-factory');
const {
    createUsageRepository,
} = require('../usage/repositories/usage-repository-factory');
const {
    ListIntegrationsReport,
} = require('./use-cases/list-integrations-report');
const { loadAppDefinition } = require('../handlers/app-definition-loader');

// IntegrationBase.Definition default — skip it so the slug is used instead.
const PLACEHOLDER_DISPLAY_NAME = 'Integration Name';

// Map each integration's config.type slug to its human-readable display label.
// Wrapped so reporting still works if the app definition fails to load.
function buildTypeLabels() {
    try {
        const { integrations = [] } = loadAppDefinition();
        const labels = {};
        for (const IntegrationClass of integrations) {
            const def = IntegrationClass?.Definition;
            if (!def?.name) continue;
            const label = def.display?.label;
            if (label && label !== PLACEHOLDER_DISPLAY_NAME) {
                labels[def.name] = label;
            }
        }
        return labels;
    } catch (error) {
        console.error(
            'Reporting: failed to load integration labels:',
            error.message
        );
        return {};
    }
}

function createReportingRouter() {
    const reportingRepository = createReportingRepository();
    const usageRepository = createUsageRepository();
    const listIntegrationsReport = new ListIntegrationsReport({
        reportingRepository,
        usageRepository,
        typeLabels: buildTypeLabels(),
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

function validateApiKey(req, res, next) {
    const apiKey = req.headers['x-frigg-reporting-api-key'];

    if (!apiKey || apiKey !== process.env.REPORTING_API_KEY) {
        console.error('Unauthorized access attempt to reporting endpoint');
        return res.status(401).json({
            status: 'error',
            message: 'Unauthorized - x-frigg-reporting-api-key header required',
        });
    }

    next();
}

module.exports = { createReportingRouter, validateApiKey };
