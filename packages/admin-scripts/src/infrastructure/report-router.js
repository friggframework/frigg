const express = require('express');
const serverless = require('serverless-http');
const { validateAdminApiKey } = require('./admin-auth-middleware');
const { createReportRunner } = require('../application/report-runner');
const { validateParams } = require('../application/validate-script-input');
const { QueuerUtil } = require('@friggframework/core/queues');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const {
    createReportSchedulerAdapterFromEnv,
} = require('../adapters/scheduler-adapter-factory');
const {
    GetEffectiveScheduleUseCase,
    UpsertScheduleUseCase,
    DeleteScheduleUseCase,
} = require('../application/use-cases');
const { bootstrapAdminScripts } = require('./bootstrap');

const router = express.Router();

// Reports use the admin API key; the dedicated REPORTING_API_KEY is retired (ADR-010).
router.use(validateAdminApiKey);

const CODE_STATUS = {
    INVALID_INPUT: 400,
    INVALID_MODE: 400,
    ARTIFACT_STORAGE_UNAVAILABLE: 501,
};

// Boom errors carry their own status; runner errors carry a `.code`; anything else is a 500.
function sendReportError(res, error, fallbackMessage) {
    if (error.isBoom) {
        return res
            .status(error.output.statusCode)
            .json({ error: error.message });
    }
    if (error.code && CODE_STATUS[error.code]) {
        return res
            .status(CODE_STATUS[error.code])
            .json({ error: error.message, code: error.code });
    }
    console.error(fallbackMessage, error);
    return res.status(500).json({ error: fallbackMessage });
}

function buildAudit(req) {
    const apiKey = req.headers['x-frigg-admin-api-key'];
    const forwardedFor = (req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
    return {
        ipAddress: forwardedFor || req.ip || null,
        apiKeyLast4: apiKey ? String(apiKey).slice(-4) : null,
    };
}

function toDefinitionSummary(definition) {
    return {
        name: definition.name,
        version: definition.version,
        description: definition.description,
        runModes: definition.runModes,
        category: definition.display?.category || 'reporting',
    };
}

router.get('/', (_req, res) => {
    try {
        const { reportFactory } = bootstrapAdminScripts();
        res.json({
            service: 'frigg-core-api',
            reports: reportFactory.getAll().map((r) =>
                toDefinitionSummary(r.definition)
            ),
        });
    } catch (error) {
        console.error('Error listing reports:', error);
        res.status(500).json({ error: 'Failed to list reports' });
    }
});

// Deprecated #607 back-compat. Registered before '/:name' so it wins the match.
router.get('/integrations', async (req, res) => {
    try {
        const {
            reportFactory,
            reportFriggCommands,
            reportCommands,
            integrationFactory,
        } = bootstrapAdminScripts();

        if (!reportFactory.has('integrations')) {
            return res.status(404).json({
                error: 'Report "integrations" not found',
                code: 'REPORT_NOT_FOUND',
            });
        }

        const { status, type, userId } = req.query;
        const runner = createReportRunner({
            reportFactory,
            reportCommands,
            friggCommands: reportFriggCommands,
            integrationFactory,
        });
        const result = await runner.execute(
            'integrations',
            { status, type, userId },
            { mode: 'live', trigger: 'MANUAL', audit: buildAudit(req) }
        );
        // #607 returned the report payload directly (not the runner envelope).
        return res.json(result.output);
    } catch (error) {
        return sendReportError(res, error, 'Failed to run integrations report');
    }
});

// Registered before '/:name' so 'executions' isn't captured as a report name.
router.get('/executions/:id', async (req, res) => {
    try {
        const { reportCommands } = bootstrapAdminScripts();
        const execution = await reportCommands.findExecutionById(req.params.id);
        if (execution.error) {
            return res.status(execution.error).json({
                error: execution.reason,
                code: execution.code,
            });
        }
        return res.json(execution);
    } catch (error) {
        return sendReportError(res, error, 'Failed to get report execution');
    }
});

router.get('/:name/snapshots', async (req, res) => {
    try {
        const { name } = req.params;
        const { reportFactory, reportCommands } = bootstrapAdminScripts();
        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }
        const snapshots = await reportCommands.findSnapshotSeries(name, {
            from: req.query.from,
            to: req.query.to,
        });
        return res.json({ snapshots });
    } catch (error) {
        return sendReportError(res, error, 'Failed to get report snapshots');
    }
});

// Default to snapshot so a scheduled report captures a time series out of the box.
function scheduledRunMode(definition) {
    return definition.schedule?.mode || 'snapshot';
}

// ScriptSchedule.scriptName is a shared operation-name namespace, so the report name keys the same row a script would.
router.get('/:name/schedule', async (req, res) => {
    try {
        const { name } = req.params;
        const { reportFactory } = bootstrapAdminScripts();
        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }

        const commands = createAdminScriptCommands();
        const getEffectiveSchedule = new GetEffectiveScheduleUseCase({
            commands,
            scriptFactory: reportFactory,
        });
        const result = await getEffectiveSchedule.execute(name);

        return res.json({
            source: result.source,
            reportName: name,
            ...result.schedule,
        });
    } catch (error) {
        return sendReportError(res, error, 'Failed to get report schedule');
    }
});

// The AWS scheduler targets the REPORT executor and enqueues a report-shaped message, not the script executor.
router.put('/:name/schedule', async (req, res) => {
    try {
        const { name } = req.params;
        const { enabled, cronExpression, timezone } = req.body || {};
        const { reportFactory } = bootstrapAdminScripts();
        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }

        const definition = reportFactory.get(name).Definition;
        const commands = createAdminScriptCommands();
        const schedulerAdapter = createReportSchedulerAdapterFromEnv({
            reportName: name,
            mode: scheduledRunMode(definition),
        });
        const upsertSchedule = new UpsertScheduleUseCase({
            commands,
            schedulerAdapter,
            scriptFactory: reportFactory,
        });

        const result = await upsertSchedule.execute(name, {
            enabled,
            cronExpression,
            timezone,
        });

        return res.json({
            success: result.success,
            schedule: {
                source: 'database',
                ...result.schedule,
            },
            ...(result.schedulerWarning && {
                schedulerWarning: result.schedulerWarning,
            }),
        });
    } catch (error) {
        return sendReportError(res, error, 'Failed to update report schedule');
    }
});

router.delete('/:name/schedule', async (req, res) => {
    try {
        const { name } = req.params;
        const { reportFactory } = bootstrapAdminScripts();
        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }

        const definition = reportFactory.get(name).Definition;
        const commands = createAdminScriptCommands();
        const schedulerAdapter = createReportSchedulerAdapterFromEnv({
            reportName: name,
            mode: scheduledRunMode(definition),
        });
        const deleteSchedule = new DeleteScheduleUseCase({
            commands,
            schedulerAdapter,
            scriptFactory: reportFactory,
        });

        const result = await deleteSchedule.execute(name);
        return res.json(result);
    } catch (error) {
        return sendReportError(res, error, 'Failed to delete report schedule');
    }
});

router.get('/:name', (req, res) => {
    try {
        const { name } = req.params;
        const { reportFactory } = bootstrapAdminScripts();

        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }

        const definition = reportFactory.get(name).Definition;
        res.json({
            name: definition.name,
            version: definition.version,
            description: definition.description,
            runModes: definition.runModes,
            inputSchema: definition.inputSchema,
            outputSchema: definition.outputSchema,
            output: definition.output,
            schedule: definition.schedule,
            display: definition.display,
        });
    } catch (error) {
        console.error('Error getting report:', error);
        res.status(500).json({ error: 'Failed to get report details' });
    }
});

router.post('/:name/run', async (req, res) => {
    try {
        const { name } = req.params;
        const { mode = 'live', params = {} } = req.body || {};
        const {
            reportFactory,
            reportFriggCommands,
            reportCommands,
            integrationFactory,
        } = bootstrapAdminScripts();

        if (!reportFactory.has(name)) {
            return res.status(404).json({
                error: `Report "${name}" not found`,
                code: 'REPORT_NOT_FOUND',
            });
        }

        if (mode === 'live') {
            const runner = createReportRunner({
                reportFactory,
                reportCommands,
                friggCommands: reportFriggCommands,
                integrationFactory,
            });
            const result = await runner.execute(name, params, {
                mode: 'live',
                trigger: 'MANUAL',
                audit: buildAudit(req),
            });
            return res.json(result);
        }

        // Validate mode + params before persisting/enqueueing so a bad request gets
        // a 400 up front instead of a 202 that only fails later in the worker.
        const definition = reportFactory.get(name).Definition;
        const runModes =
            Array.isArray(definition.runModes) && definition.runModes.length
                ? definition.runModes
                : ['live'];
        if (!runModes.includes(mode)) {
            return res.status(400).json({
                error: `Report "${name}" does not support mode "${mode}". Allowed: ${runModes.join(
                    ', '
                )}`,
                code: 'INVALID_MODE',
            });
        }
        const validation = validateParams(definition, params);
        if (!validation.valid) {
            return res.status(400).json({
                error: `Invalid input: ${validation.errors.join(', ')}`,
                code: 'INVALID_INPUT',
            });
        }

        const queueUrl = process.env.REPORT_QUEUE_URL;
        if (!queueUrl) {
            return res.status(503).json({
                error: 'Async report execution is not configured (REPORT_QUEUE_URL not set)',
                code: 'QUEUE_NOT_CONFIGURED',
            });
        }

        const { seriesName } = req.body || {};
        const execution = await reportCommands.createExecution({
            reportName: name,
            reportVersion: definition.version,
            trigger: 'MANUAL',
            mode,
            input: params,
            audit: buildAudit(req),
            seriesName,
        });

        // Commands return an error object (never throw) — don't queue a broken execution.
        if (execution.error) {
            return res.status(execution.error).json({
                error: execution.reason || 'Failed to create report execution record',
                code: execution.code,
            });
        }

        try {
            await QueuerUtil.send(
                {
                    reportName: name,
                    executionId: execution.id,
                    mode,
                    seriesName,
                    trigger: 'MANUAL',
                    params,
                },
                queueUrl
            );
        } catch (enqueueError) {
            // The record is persisted but will never be picked up — compensate
            // so it doesn't linger non-terminal (symmetric with the
            // createExecution-error guard above).
            await reportCommands.completeExecution(execution.id, {
                state: 'FAILED',
                error: {
                    name: enqueueError.name,
                    message: enqueueError.message,
                },
            });
            throw enqueueError;
        }

        return res.status(202).json({
            executionId: execution.id,
            status: 'QUEUED',
            reportName: name,
        });
    } catch (error) {
        return sendReportError(res, error, 'Failed to run report');
    }
});

const app = express();
app.use(express.json());
app.use('/api/v2/reports', router);

const handler = serverless(app);

module.exports = { router, app, handler };
