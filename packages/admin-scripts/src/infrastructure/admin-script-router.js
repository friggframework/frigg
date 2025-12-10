const express = require('express');
const serverless = require('serverless-http');
const { adminAuthMiddleware } = require('./admin-auth-middleware');
const { getScriptFactory } = require('../application/script-factory');
const { createScriptRunner } = require('../application/script-runner');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');
const { QueuerUtil } = require('@friggframework/core/queues');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(adminAuthMiddleware);

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
                requiresIntegrationFactory:
                    s.definition.config?.requiresIntegrationFactory || false,
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
 * POST /admin/scripts/:scriptName/execute
 * Execute a script (sync, async, or dry-run)
 */
router.post('/scripts/:scriptName/execute', async (req, res) => {
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
                audit: req.adminAudit,
            });
            return res.json(result);
        }

        if (mode === 'sync') {
            // Synchronous execution - wait for result
            const runner = createScriptRunner();
            const result = await runner.execute(scriptName, params, {
                trigger: 'MANUAL',
                mode: 'sync',
                audit: req.adminAudit,
            });
            return res.json(result);
        }

        // Async execution - queue and return immediately
        const commands = createAdminScriptCommands();
        const execution = await commands.createScriptExecution({
            scriptName,
            scriptVersion: factory.get(scriptName).Definition.version,
            trigger: 'MANUAL',
            mode: 'async',
            input: params,
            audit: req.adminAudit,
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
 * GET /admin/executions/:executionId
 * Get execution status
 */
router.get('/executions/:executionId', async (req, res) => {
    try {
        const { executionId } = req.params;
        const commands = createAdminScriptCommands();
        const execution = await commands.findScriptExecutionById(executionId);

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
 * GET /admin/executions
 * List recent executions
 */
router.get('/executions', async (req, res) => {
    try {
        const { scriptName, status, limit = 50 } = req.query;
        const commands = createAdminScriptCommands();

        const executions = await commands.findRecentExecutions({
            scriptName,
            status,
            limit: parseInt(limit, 10),
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
        const factory = getScriptFactory();
        const commands = createAdminScriptCommands();

        // 1. Validate script exists
        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        // 2. Get script class to access Definition
        const scriptClass = factory.get(scriptName);
        const definitionSchedule = scriptClass.Definition?.schedule;

        // 3. Get database schedule (if exists)
        const dbSchedule = await commands.getScheduleByScriptName(scriptName);

        // 4. Apply hybrid schedule logic: DB override > Definition default > none
        if (dbSchedule) {
            // Database override exists
            return res.json({
                source: 'database',
                scriptName,
                enabled: dbSchedule.enabled,
                cronExpression: dbSchedule.cronExpression,
                timezone: dbSchedule.timezone,
                lastTriggeredAt: dbSchedule.lastTriggeredAt,
                nextTriggerAt: dbSchedule.nextTriggerAt,
                awsRuleArn: dbSchedule.awsRuleArn,
                awsRuleName: dbSchedule.awsRuleName,
                createdAt: dbSchedule.createdAt,
                updatedAt: dbSchedule.updatedAt,
            });
        }

        if (definitionSchedule?.enabled) {
            // Definition default exists
            return res.json({
                source: 'definition',
                scriptName,
                enabled: definitionSchedule.enabled,
                cronExpression: definitionSchedule.cronExpression,
                timezone: definitionSchedule.timezone || 'UTC',
            });
        }

        // No schedule configured
        return res.json({
            source: 'none',
            scriptName,
            enabled: false,
        });
    } catch (error) {
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
        const factory = getScriptFactory();
        const commands = createAdminScriptCommands();

        // 1. Validate script exists
        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        // 2. Validate required fields
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({
                error: 'Field "enabled" is required and must be a boolean',
                code: 'INVALID_INPUT',
            });
        }

        if (enabled && !cronExpression) {
            return res.status(400).json({
                error: 'Field "cronExpression" is required when enabled is true',
                code: 'INVALID_INPUT',
            });
        }

        // 3. Upsert schedule to database
        const schedule = await commands.upsertSchedule({
            scriptName,
            enabled,
            cronExpression: cronExpression || null,
            timezone: timezone || 'UTC',
        });

        // 4. TODO (Phase 3): Create/update EventBridge schedule if enabled
        // if (enabled && cronExpression) {
        //     const awsInfo = await provisionEventBridgeSchedule(scriptName, cronExpression, timezone);
        //     await commands.updateScheduleAwsRule(scriptName, awsInfo);
        // }

        res.json({
            success: true,
            schedule: {
                source: 'database',
                scriptName: schedule.scriptName,
                enabled: schedule.enabled,
                cronExpression: schedule.cronExpression,
                timezone: schedule.timezone,
                lastTriggeredAt: schedule.lastTriggeredAt,
                nextTriggerAt: schedule.nextTriggerAt,
                createdAt: schedule.createdAt,
                updatedAt: schedule.updatedAt,
            },
        });
    } catch (error) {
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
        const factory = getScriptFactory();
        const commands = createAdminScriptCommands();

        // 1. Validate script exists
        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
        }

        // 2. Delete schedule from database
        const result = await commands.deleteSchedule(scriptName);

        // 3. TODO (Phase 3): Delete EventBridge schedule if exists
        // if (result.deleted?.awsRuleArn) {
        //     await deleteEventBridgeSchedule(result.deleted.awsRuleName);
        // }

        // 4. Check if Definition default exists
        const scriptClass = factory.get(scriptName);
        const definitionSchedule = scriptClass.Definition?.schedule;

        res.json({
            success: true,
            deletedCount: result.deletedCount,
            message:
                result.deletedCount > 0
                    ? 'Schedule override removed'
                    : 'No schedule override found',
            effectiveSchedule: definitionSchedule?.enabled
                ? {
                      source: 'definition',
                      enabled: definitionSchedule.enabled,
                      cronExpression: definitionSchedule.cronExpression,
                      timezone: definitionSchedule.timezone || 'UTC',
                  }
                : { source: 'none', enabled: false },
        });
    } catch (error) {
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
