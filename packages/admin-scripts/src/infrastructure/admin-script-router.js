const express = require('express');
const serverless = require('serverless-http');
const Boom = require('@hapi/boom');
const { validateAdminApiKey } = require('./admin-auth-middleware');
const { createScriptRunner } = require('../application/script-runner');
const {
    validateScriptInput,
    validateParams,
} = require('../application/validate-script-input');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const {
    createSchedulerAdapter,
} = require('../adapters/scheduler-adapter-factory');
const { bootstrapAdminScripts } = require('./bootstrap');
const {
    GetEffectiveScheduleUseCase,
    UpsertScheduleUseCase,
    DeleteScheduleUseCase,
} = require('../application/use-cases');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(validateAdminApiKey);

// Build (once, memoized) and inject the per-process dependencies onto the
// request, so route handlers consume them explicitly instead of reaching for a
// global. Registers the host app's admin scripts on the first request.
router.use((req, _res, next) => {
    const { scriptFactory, integrationFactory } = bootstrapAdminScripts();
    req.scriptFactory = scriptFactory;
    req.integrationFactory = integrationFactory;
    next();
});

/**
 * Translate a thrown error into an HTTP response. Boom errors (thrown by the
 * schedule use cases) carry their own status code; anything else is an
 * unexpected 500. Mirrors the framework's app-handler-helpers convention.
 * @private
 */
function sendError(res, error, fallbackMessage) {
    if (error.isBoom) {
        return res
            .status(error.output.statusCode)
            .json({ error: error.message });
    }
    console.error(fallbackMessage, error);
    return res.status(500).json({ error: fallbackMessage });
}

/**
 * Build audit metadata for an execution from the request.
 * @private
 */
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

/**
 * Create schedule use case instances
 * @param {ScriptFactory} scriptFactory - Registry injected from the request.
 * @private
 */
function createScheduleUseCases(scriptFactory) {
    const commands = createAdminScriptCommands();

    // The local adapter is in-memory only (schedules vanish on cold start), so it
    // must never be the silent default in a deployed Lambda. Require an explicit
    // provider when running on AWS; fall back to 'local' only for local dev/tests.
    const schedulerType =
        process.env.SCHEDULER_PROVIDER ||
        (process.env.AWS_LAMBDA_FUNCTION_NAME ? null : 'local');
    if (!schedulerType) {
        throw Boom.serverUnavailable(
            'SCHEDULER_PROVIDER is not configured. Set it (e.g. "aws") via appDefinition.admin.enableScheduling.'
        );
    }

    const schedulerAdapter = createSchedulerAdapter({
        type: schedulerType,
        targetLambdaArn: process.env.ADMIN_SCRIPT_EXECUTOR_LAMBDA_ARN,
        scheduleGroupName: process.env.ADMIN_SCRIPT_SCHEDULE_GROUP,
        roleArn: process.env.SCHEDULER_ROLE_ARN,
    });

    return {
        getEffectiveSchedule: new GetEffectiveScheduleUseCase({
            commands,
            scriptFactory,
        }),
        upsertSchedule: new UpsertScheduleUseCase({
            commands,
            schedulerAdapter,
            scriptFactory,
        }),
        deleteSchedule: new DeleteScheduleUseCase({
            commands,
            schedulerAdapter,
            scriptFactory,
        }),
    };
}

/**
 * GET /admin/scripts
 * List all registered scripts
 */
router.get('/scripts', async (req, res) => {
    try {
        const factory = req.scriptFactory;
        const scripts = factory.getAll();

        res.json({
            scripts: scripts.map((s) => ({
                name: s.name,
                version: s.definition.version,
                description: s.definition.description,
                category: s.definition.display?.category || 'custom',
                requireIntegrationInstance:
                    s.definition.config?.requireIntegrationInstance || false,
            })),
        });
    } catch (error) {
        console.error('Error listing scripts:', error);
        res.status(500).json({ error: 'Failed to list scripts' });
    }
});

/**
 * GET /admin/scripts/:scriptName
 * Get script details
 */
router.get('/scripts/:scriptName', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const factory = req.scriptFactory;

        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        const scriptClass = factory.get(scriptName);
        const definition = scriptClass.Definition;

        res.json({
            name: definition.name,
            version: definition.version,
            description: definition.description,
            inputSchema: definition.inputSchema,
            outputSchema: definition.outputSchema,
            config: definition.config,
            display: definition.display,
        });
    } catch (error) {
        console.error('Error getting script:', error);
        res.status(500).json({ error: 'Failed to get script details' });
    }
});

/**
 * POST /admin/scripts/:scriptName/validate
 * Validate script inputs without executing (dry-run)
 */
router.post('/scripts/:scriptName/validate', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { params = {} } = req.body;
        const factory = req.scriptFactory;

        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        const result = validateScriptInput(factory, scriptName, params);
        res.json(result);
    } catch (error) {
        console.error('Error validating script:', error);
        res.status(500).json({ error: 'Failed to validate script' });
    }
});

/**
 * POST /admin/scripts/:scriptName
 * Execute a script (sync or async)
 */
router.post('/scripts/:scriptName', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { params = {}, mode = 'async' } = req.body;
        const factory = req.scriptFactory;

        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        const definition = factory.get(scriptName).Definition;

        // Fail fast on invalid input instead of starting an execution that will error
        const validation = validateParams(definition, params);
        if (!validation.valid) {
            return res.status(400).json({
                error: `Invalid input: ${validation.errors.join(', ')}`,
                code: 'INVALID_INPUT',
                details: validation.errors,
            });
        }

        const audit = buildAudit(req);

        if (mode === 'sync') {
            // Sync runs inside the 30s API Lambda; long scripts must use async
            const timeout = definition.config?.timeout;
            if (
                process.env.AWS_LAMBDA_FUNCTION_NAME &&
                timeout &&
                timeout > 25000
            ) {
                return res.status(400).json({
                    error: `Script "${scriptName}" timeout (${timeout}ms) exceeds the sync API limit. Use mode: "async".`,
                    code: 'SYNC_TIMEOUT_TOO_LONG',
                });
            }

            const runner = createScriptRunner({
                scriptFactory: req.scriptFactory,
                integrationFactory: req.integrationFactory,
            });
            const result = await runner.execute(scriptName, params, {
                trigger: 'MANUAL',
                mode: 'sync',
                audit,
            });
            return res.json(result);
        }

        // Async execution - queue and return immediately
        const queueUrl = process.env.ADMIN_SCRIPT_QUEUE_URL;
        if (!queueUrl) {
            return res.status(503).json({
                error: 'Async execution is not configured (ADMIN_SCRIPT_QUEUE_URL not set)',
                code: 'QUEUE_NOT_CONFIGURED',
            });
        }

        const commands = createAdminScriptCommands();
        const execution = await commands.createAdminProcess({
            scriptName,
            scriptVersion: definition.version,
            trigger: 'MANUAL',
            mode: 'async',
            input: params,
            audit,
        });

        // Commands return an error object (never throw) — don't queue a broken execution
        if (execution.error) {
            return res.status(execution.error).json({
                error: execution.reason || 'Failed to create execution record',
                code: execution.code,
            });
        }

        // Queue the execution
        await QueuerUtil.send(
            {
                scriptName,
                executionId: execution.id,
                trigger: 'MANUAL',
                params,
            },
            queueUrl
        );

        res.status(202).json({
            executionId: execution.id,
            status: 'QUEUED',
            scriptName,
            message: 'Script queued for execution',
        });
    } catch (error) {
        console.error('Error executing script:', error);
        res.status(500).json({ error: 'Failed to execute script' });
    }
});

/**
 * GET /admin/scripts/:scriptName/executions/:executionId
 * Get execution status for specific script
 */
router.get('/scripts/:scriptName/executions/:executionId', async (req, res) => {
    try {
        const { executionId } = req.params;
        const commands = createAdminScriptCommands();
        const execution = await commands.findAdminProcessById(executionId);

        if (execution.error) {
            return res.status(execution.error).json({
                error: execution.reason,
                code: execution.code,
            });
        }

        res.json(execution);
    } catch (error) {
        console.error('Error getting execution:', error);
        res.status(500).json({ error: 'Failed to get execution' });
    }
});

/**
 * GET /admin/scripts/:scriptName/executions
 * List recent executions for specific script
 */
router.get('/scripts/:scriptName/executions', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { status, limit = 50 } = req.query;
        const commands = createAdminScriptCommands();

        const parsedLimit = Number.parseInt(limit, 10);
        const safeLimit = Number.isNaN(parsedLimit)
            ? 50
            : Math.min(Math.max(parsedLimit, 1), 200);

        const executions = await commands.findAdminProcessesByName(scriptName, {
            limit: safeLimit,
            ...(status && { state: status }),
        });

        res.json({ executions });
    } catch (error) {
        console.error('Error listing executions:', error);
        res.status(500).json({ error: 'Failed to list executions' });
    }
});

/**
 * GET /admin/scripts/:scriptName/schedule
 * Get effective schedule (DB override > Definition default > none)
 */
router.get('/scripts/:scriptName/schedule', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { getEffectiveSchedule } = createScheduleUseCases(
            req.scriptFactory
        );

        const result = await getEffectiveSchedule.execute(scriptName);

        res.json({
            source: result.source,
            scriptName,
            ...result.schedule,
        });
    } catch (error) {
        return sendError(res, error, 'Failed to get schedule');
    }
});

/**
 * PUT /admin/scripts/:scriptName/schedule
 * Create or update schedule override
 */
router.put('/scripts/:scriptName/schedule', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { enabled, cronExpression, timezone } = req.body;
        const { upsertSchedule } = createScheduleUseCases(req.scriptFactory);

        const result = await upsertSchedule.execute(scriptName, {
            enabled,
            cronExpression,
            timezone,
        });

        res.json({
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
        return sendError(res, error, 'Failed to update schedule');
    }
});

/**
 * DELETE /admin/scripts/:scriptName/schedule
 * Remove schedule override (revert to Definition default)
 */
router.delete('/scripts/:scriptName/schedule', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { deleteSchedule } = createScheduleUseCases(req.scriptFactory);

        const result = await deleteSchedule.execute(scriptName);

        res.json(result);
    } catch (error) {
        return sendError(res, error, 'Failed to delete schedule');
    }
});

// Create Express app
const app = express();
app.use(express.json());
app.use('/admin', router);

// Export for Lambda
const handler = serverless(app);

module.exports = { router, app, handler };
