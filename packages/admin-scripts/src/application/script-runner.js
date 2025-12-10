const { getScriptFactory } = require('./script-factory');
const { createAdminFriggCommands } = require('./admin-frigg-commands');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

/**
 * Script Runner
 *
 * Orchestrates script execution with:
 * - Execution record creation
 * - Script instantiation
 * - AdminFriggCommands injection
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
     * @param {string} options.executionId - Reuse existing execution ID
     */
    async execute(scriptName, params = {}, options = {}) {
        const { trigger = 'MANUAL', audit = {}, executionId: existingExecutionId } = options;

        // Get script class
        const scriptClass = this.scriptFactory.get(scriptName);
        const definition = scriptClass.Definition;

        // Validate integrationFactory requirement
        if (definition.config?.requiresIntegrationFactory && !this.integrationFactory) {
            throw new Error(
                `Script "${scriptName}" requires integrationFactory but none was provided`
            );
        }

        let executionId = existingExecutionId;

        // Create execution record if not provided
        if (!executionId) {
            const execution = await this.commands.createScriptExecution({
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
            // Update status to RUNNING
            await this.commands.updateScriptExecutionStatus(executionId, 'RUNNING');

            // Create frigg commands for the script
            const frigg = createAdminFriggCommands({
                executionId,
                integrationFactory: this.integrationFactory,
            });

            // Create script instance
            const script = this.scriptFactory.createInstance(scriptName, {
                executionId,
                integrationFactory: this.integrationFactory,
            });

            // Execute the script
            const output = await script.execute(frigg, params);

            // Calculate metrics
            const endTime = new Date();
            const durationMs = endTime - startTime;

            // Complete execution
            await this.commands.completeScriptExecution(executionId, {
                status: 'COMPLETED',
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
            // Calculate metrics even on failure
            const endTime = new Date();
            const durationMs = endTime - startTime;

            // Record failure
            await this.commands.completeScriptExecution(executionId, {
                status: 'FAILED',
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
