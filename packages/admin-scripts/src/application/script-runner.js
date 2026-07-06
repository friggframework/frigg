const { createAdminScriptContext } = require('./admin-script-context');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');

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
    /**
     * @param {Object} params
     * @param {ScriptFactory} params.scriptFactory - Required. The registry used
     *   to resolve and instantiate scripts by name (built by bootstrap.js).
     * @param {Object} [params.commands] - Admin process command layer; defaults
     *   to a fresh createAdminScriptCommands().
     * @param {Object} [params.integrationFactory] - Hydrates integration
     *   instances for scripts that need them.
     */
    constructor(params = {}) {
        if (!params.scriptFactory) {
            throw new Error('ScriptRunner requires a scriptFactory');
        }
        this.scriptFactory = params.scriptFactory;
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
        const {
            trigger,
            audit = {},
            executionId: existingExecutionId,
            parentExecutionId,
        } = options;

        if (!trigger) {
            throw new Error(
                'options.trigger is required (MANUAL | SCHEDULED | QUEUE)'
            );
        }

        // Get script class
        const scriptClass = this.scriptFactory.get(scriptName);
        const definition = scriptClass.Definition;

        // Validate integrationFactory requirement
        if (
            definition.config?.requireIntegrationInstance &&
            !this.integrationFactory
        ) {
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
                parentExecutionId,
            });
            // Commands return an error object (never throw) — fail loudly rather
            // than tracking an `undefined` execution id.
            if (execution.error) {
                throw new Error(
                    execution.reason || 'Failed to create admin process record'
                );
            }
            executionId = execution.id;
        }

        const startTime = new Date();

        // Created up front so collected logs can be persisted on both paths.
        const context = createAdminScriptContext({
            executionId,
            integrationFactory: this.integrationFactory,
        });

        let output;
        try {
            await this.commands.updateAdminProcessState(executionId, 'RUNNING');

            // Create script instance with context injected via constructor
            const script = this.scriptFactory.createInstance(scriptName, {
                context,
                executionId,
                integrationFactory: this.integrationFactory,
            });

            // Execute the script
            output = await script.execute(params);
        } catch (error) {
            const durationMs = new Date() - startTime;

            const completion = await this.commands.completeAdminProcess(
                executionId,
                {
                    state: 'FAILED',
                    error: {
                        name: error.name,
                        message: error.message,
                        stack: error.stack,
                    },
                    metrics: {
                        startTime: startTime.toISOString(),
                        endTime: new Date().toISOString(),
                        durationMs,
                    },
                    logs: context.getLogs(),
                }
            );
            if (completion?.error) {
                console.error(
                    `Failed to persist FAILED state for execution ${executionId}:`,
                    completion.reason
                );
            }

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

        // Script succeeded. Persist completion OUTSIDE the try above so a
        // persistence failure here is never misreported as a script failure.
        const durationMs = new Date() - startTime;
        const result = {
            executionId,
            status: 'COMPLETED',
            scriptName,
            output,
            metrics: { durationMs },
        };

        const completion = await this.commands.completeAdminProcess(
            executionId,
            {
                state: 'COMPLETED',
                output,
                metrics: {
                    startTime: startTime.toISOString(),
                    endTime: new Date().toISOString(),
                    durationMs,
                },
                logs: context.getLogs(),
            }
        );
        if (completion?.error) {
            console.error(
                `Script "${scriptName}" ran successfully but persisting COMPLETED state failed for execution ${executionId}:`,
                completion.reason
            );
            result.stateUpdateFailed = true;
        }

        return result;
    }
}

function createScriptRunner(params = {}) {
    return new ScriptRunner(params);
}

module.exports = { ScriptRunner, createScriptRunner };
