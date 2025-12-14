const { getScriptFactory } = require('./script-factory');
const { createAdminFriggCommands } = require('./admin-frigg-commands');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');
const { wrapAdminFriggCommandsForDryRun } = require('./dry-run-repository-wrapper');
const { createDryRunHttpClient, injectDryRunHttpClient } = require('./dry-run-http-interceptor');

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
     * @param {boolean} options.dryRun - Execute in dry-run mode (no writes, log operations)
     */
    async execute(scriptName, params = {}, options = {}) {
        const { trigger = 'MANUAL', audit = {}, executionId: existingExecutionId, dryRun = false } = options;

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
            // Update status to RUNNING (skip in dry-run)
            if (!dryRun) {
                await this.commands.updateScriptExecutionStatus(executionId, 'RUNNING');
            }

            // Create frigg commands for the script
            let frigg;
            let operationLog = [];

            if (dryRun) {
                // Dry-run mode: wrap commands to intercept writes
                frigg = this.createDryRunFriggCommands(operationLog);
            } else {
                // Normal mode: create real commands
                frigg = createAdminFriggCommands({
                    executionId,
                    integrationFactory: this.integrationFactory,
                });
            }

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

            // Complete execution (skip in dry-run)
            if (!dryRun) {
                await this.commands.completeScriptExecution(executionId, {
                    status: 'COMPLETED',
                    output,
                    metrics: {
                        startTime: startTime.toISOString(),
                        endTime: endTime.toISOString(),
                        durationMs,
                    },
                });
            }

            // Return dry-run preview if in dry-run mode
            if (dryRun) {
                return {
                    executionId,
                    dryRun: true,
                    status: 'DRY_RUN_COMPLETED',
                    scriptName,
                    preview: {
                        operations: operationLog,
                        summary: this.summarizeOperations(operationLog),
                        scriptOutput: output,
                    },
                    metrics: { durationMs },
                };
            }

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

            // Record failure (skip in dry-run)
            if (!dryRun) {
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
            }

            return {
                executionId,
                dryRun,
                status: dryRun ? 'DRY_RUN_FAILED' : 'FAILED',
                scriptName,
                error: {
                    name: error.name,
                    message: error.message,
                },
                metrics: { durationMs },
            };
        }
    }

    /**
     * Create dry-run version of AdminFriggCommands
     * Intercepts all write operations and logs them
     *
     * @param {Array} operationLog - Array to collect logged operations
     * @returns {Object} Wrapped AdminFriggCommands
     */
    createDryRunFriggCommands(operationLog) {
        // Create real commands (for read operations)
        const realCommands = createAdminFriggCommands({
            executionId: null, // Don't persist logs in dry-run
            integrationFactory: this.integrationFactory,
        });

        // Wrap commands to intercept writes
        const wrappedCommands = wrapAdminFriggCommandsForDryRun(realCommands, operationLog);

        // Create dry-run HTTP client
        const dryRunHttpClient = createDryRunHttpClient(operationLog);

        // Override instantiate to inject dry-run HTTP client
        const originalInstantiate = wrappedCommands.instantiate.bind(wrappedCommands);
        wrappedCommands.instantiate = async (integrationId) => {
            const instance = await originalInstantiate(integrationId);

            // Inject dry-run HTTP client into the integration instance
            injectDryRunHttpClient(instance, dryRunHttpClient);

            return instance;
        };

        return wrappedCommands;
    }

    /**
     * Summarize operations from dry-run log
     *
     * @param {Array} log - Operation log
     * @returns {Object} Summary statistics
     */
    summarizeOperations(log) {
        const summary = {
            totalOperations: log.length,
            databaseWrites: 0,
            httpRequests: 0,
            byOperation: {},
            byModel: {},
            byService: {},
        };

        for (const op of log) {
            // Count by operation type
            const operation = op.operation || op.method || 'UNKNOWN';
            summary.byOperation[operation] = (summary.byOperation[operation] || 0) + 1;

            // Database operations
            if (op.model) {
                summary.databaseWrites++;
                summary.byModel[op.model] = summary.byModel[op.model] || [];
                summary.byModel[op.model].push({
                    operation: op.operation,
                    method: op.method,
                    timestamp: op.timestamp,
                });
            }

            // HTTP requests
            if (op.operation === 'HTTP_REQUEST') {
                summary.httpRequests++;
                const service = op.service || 'unknown';
                summary.byService[service] = (summary.byService[service] || 0) + 1;
            }
        }

        return summary;
    }
}

function createScriptRunner(params = {}) {
    return new ScriptRunner(params);
}

module.exports = { ScriptRunner, createScriptRunner };
