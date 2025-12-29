const express = require('express');
const serverless = require('serverless-http');
const { validateAdminApiKey } = require('./admin-auth-middleware');
const { getScriptFactory } = require('../application/script-factory');
const { createScriptRunner } = require('../application/script-runner');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const { createSchedulerAdapter } = require('../adapters/scheduler-adapter-factory');
const {
    GetEffectiveScheduleUseCase,
    UpsertScheduleUseCase,
    DeleteScheduleUseCase,
} = require('../application/use-cases');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(validateAdminApiKey);

/**
 * Create schedule use case instances
 * @private
 */
function createScheduleUseCases() {
    const commands = createAdminScriptCommands();
    const schedulerAdapter = createSchedulerAdapter();
    const scriptFactory = getScriptFactory();

    return {
        getEffectiveSchedule: new GetEffectiveScheduleUseCase({ commands, scriptFactory }),
        upsertSchedule: new UpsertScheduleUseCase({ commands, schedulerAdapter, scriptFactory }),
        deleteSchedule: new DeleteScheduleUseCase({ commands, schedulerAdapter, scriptFactory }),
    };
}

/**
 * GET /admin/scripts
 * List all registered scripts
 */
router.get('/scripts', async (req, res) => {
    try {
        const factory = getScriptFactory();
        const scripts = factory.getAll();

        res.json({
            scripts: scripts.map((s) => ({
                name: s.name,
                version: s.definition.version,
                description: s.definition.description,
                category: s.definition.display?.category || 'custom',
                requireIntegrationInstance:
                    s.definition.config?.requireIntegrationInstance || false,
                schedule: s.definition.schedule || null,
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
        const factory = getScriptFactory();

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
            schedule: definition.schedule,
        });
    } catch (error) {
        console.error('Error getting script:', error);
        res.status(500).json({ error: 'Failed to get script details' });
    }
});

/**
 * POST /admin/scripts/:scriptName
 * Execute a script (sync, async, or dry-run)
 */
router.post('/scripts/:scriptName', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { params = {}, mode = 'async', dryRun = false } = req.body;
        const factory = getScriptFactory();

        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        // Dry-run always executes synchronously
        if (dryRun) {
            const runner = createScriptRunner();
            const result = await runner.execute(scriptName, params, {
                trigger: 'MANUAL',
                mode: 'sync',
                dryRun: true,
            });
            return res.json(result);
        }

        if (mode === 'sync') {
            // Synchronous execution - wait for result
            const runner = createScriptRunner();
            const result = await runner.execute(scriptName, params, {
                trigger: 'MANUAL',
                mode: 'sync',
            });
            return res.json(result);
        }

        // Async execution - queue and return immediately
        const commands = createAdminScriptCommands();
        const execution = await commands.createAdminProcess({
            scriptName,
            scriptVersion: factory.get(scriptName).Definition.version,
            trigger: 'MANUAL',
            mode: 'async',
            input: params,
        });

        // Queue the execution
        await QueuerUtil.send(
            {
                scriptName,
                executionId: execution.id,
                trigger: 'MANUAL',
                params,
            },
            process.env.ADMIN_SCRIPT_QUEUE_URL
        );

        res.status(202).json({
            executionId: execution.id,
            status: 'PENDING',
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

        const executions = await commands.findRecentExecutions({
            scriptName,
            status,
            limit: Number.parseInt(limit, 10),
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
        const { getEffectiveSchedule } = createScheduleUseCases();

        const result = await getEffectiveSchedule.execute(scriptName);

        res.json({
            source: result.source,
            scriptName,
            ...result.schedule,
        });
    } catch (error) {
        if (error.code === 'SCRIPT_NOT_FOUND') {
            return res.status(404).json({
                error: error.message,
                code: error.code,
            });
        }
        console.error('Error getting schedule:', error);
        res.status(500).json({ error: 'Failed to get schedule' });
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
        const { upsertSchedule } = createScheduleUseCases();

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
            ...(result.schedulerWarning && { schedulerWarning: result.schedulerWarning }),
        });
    } catch (error) {
        if (error.code === 'SCRIPT_NOT_FOUND') {
            return res.status(404).json({
                error: error.message,
                code: error.code,
            });
        }
        if (error.code === 'INVALID_INPUT') {
            return res.status(400).json({
                error: error.message,
                code: error.code,
            });
        }
        console.error('Error updating schedule:', error);
        res.status(500).json({ error: 'Failed to update schedule' });
    }
});

/**
 * DELETE /admin/scripts/:scriptName/schedule
 * Remove schedule override (revert to Definition default)
 */
router.delete('/scripts/:scriptName/schedule', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { deleteSchedule } = createScheduleUseCases();

        const result = await deleteSchedule.execute(scriptName);

        res.json(result);
    } catch (error) {
        if (error.code === 'SCRIPT_NOT_FOUND') {
            return res.status(404).json({
                error: error.message,
                code: error.code,
            });
        }
        console.error('Error deleting schedule:', error);
        res.status(500).json({ error: 'Failed to delete schedule' });
    }
});

// Create Express app
const app = express();
app.use(express.json());
app.use('/admin', router);

// Export for Lambda
const handler = serverless(app);

module.exports = { router, app, handler };
