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
 * Execute a script (sync or async)
 */
router.post('/scripts/:scriptName/execute', async (req, res) => {
    try {
        const { scriptName } = req.params;
        const { params = {}, mode = 'async' } = req.body;
        const factory = getScriptFactory();

        if (!factory.has(scriptName)) {
            return res.status(404).json({
                error: `Script "${scriptName}" not found`,
                code: 'SCRIPT_NOT_FOUND',
            });
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

// Create Express app
const app = express();
app.use(express.json());
app.use('/admin', router);

// Export for Lambda
const handler = serverless(app);

module.exports = { router, app, handler };
