const { getScriptFactory } = require('./script-factory');
const { createAdminScriptContext } = require('./admin-frigg-commands');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

/**
 * Script Runner
 *
 * Orchestrates script execution with:
 * - Execution record creation
 * - Script instantiation with context injection
 * - Error handling
 * - Status updates
 */
class ScriptRunner {
    constructor(params = {}) {
        this.scriptFactory = params.scriptFactory || getScriptFactory();
        this.commands = params.commands || createAdminScriptCommands();
        this.integrationFactory = params.integrationFactory || null;
    }

    /**
     * Execute a script
     * @param {string} scriptName - Name of the script to run
     * @param {Object} params - Script parameters
     * @param {Object} options - Execution options
     * @param {string} options.trigger - 'MANUAL' | 'SCHEDULED' | 'QUEUE'
     * @param {string} options.mode - 'sync' | 'async'
     * @param {Object} options.audit - Audit info { apiKeyName, apiKeyLast4, ipAddress }
     * @param {string} options.executionId - Reuse existing AdminProcess record ID (NOT the Lambda execution ID).
     *   This is the database ID from the AdminProcess collection/table that tracks script executions.
     *   Pass this when resuming a queued execution to continue using the same execution record.
     */
    async execute(scriptName, params = {}, options = {}) {
        const { trigger, audit = {}, executionId: existingExecutionId } = options;

        if (!trigger) {
            throw new Error('options.trigger is required (MANUAL | SCHEDULED | QUEUE)');
        }

        // Get script class
        const scriptClass = this.scriptFactory.get(scriptName);
        const definition = scriptClass.Definition;

        // Validate integrationFactory requirement
        if (definition.config?.requireIntegrationInstance && !this.integrationFactory) {
            throw new Error(
                `Script "${scriptName}" requires integrationFactory but none was provided`
            );
        }

        let executionId = existingExecutionId;

        // Create execution record if not provided
        if (!executionId) {
            const execution = await this.commands.createAdminProcess({
                scriptName,
                scriptVersion: definition.version,
                trigger,
                mode: options.mode || 'async',
                input: params,
                audit,
            });
            executionId = execution.id;
        }

        const startTime = new Date();

        try {
            await this.commands.updateAdminProcessState(executionId, 'RUNNING');

            // Create context for the script (facade over repositories, queue, logging)
            const context = createAdminScriptContext({
                executionId,
                integrationFactory: this.integrationFactory,
            });

            // Create script instance with context injected via constructor
            const script = this.scriptFactory.createInstance(scriptName, {
                context,
                executionId,
                integrationFactory: this.integrationFactory,
            });

            // Execute the script
            const output = await script.execute(params);

            // Calculate metrics
            const endTime = new Date();
            const durationMs = endTime - startTime;

            await this.commands.completeAdminProcess(executionId, {
                state: 'COMPLETED',
                output,
                metrics: {
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    durationMs,
                },
            });

            return {
                executionId,
                status: 'COMPLETED',
                scriptName,
                output,
                metrics: { durationMs },
            };
        } catch (error) {
            const endTime = new Date();
            const durationMs = endTime - startTime;

            await this.commands.completeAdminProcess(executionId, {
                state: 'FAILED',
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                },
                metrics: {
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    durationMs,
                },
            });

            return {
                executionId,
                status: 'FAILED',
                scriptName,
                error: {
                    name: error.name,
                    message: error.message,
                },
                metrics: { durationMs },
            };
        }
    }
}

function createScriptRunner(params = {}) {
    return new ScriptRunner(params);
}

module.exports = { ScriptRunner, createScriptRunner };
