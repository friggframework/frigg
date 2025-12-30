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
     * @param {boolean} options.dryRun - Dry-run mode: validate and preview without executing
     */
    async execute(scriptName, params = {}, options = {}) {
        const { trigger = 'MANUAL', audit = {}, executionId: existingExecutionId, dryRun = false } = options;

        // Get script class
        const scriptClass = this.scriptFactory.get(scriptName);
        const definition = scriptClass.Definition;

        // Validate integrationFactory requirement
        if (definition.config?.requireIntegrationInstance && !this.integrationFactory) {
            throw new Error(
                `Script "${scriptName}" requires integrationFactory but none was provided`
            );
        }

        // Dry-run mode: validate and return preview without executing
        if (dryRun) {
            return this.createDryRunPreview(scriptName, definition, params);
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

    /**
     * Create dry-run preview without executing the script
     * Validates inputs and shows what would be executed
     *
     * @param {string} scriptName - Script name
     * @param {Object} definition - Script definition
     * @param {Object} params - Input parameters
     * @returns {Object} Dry-run preview
     */
    createDryRunPreview(scriptName, definition, params) {
        const validation = this.validateParams(definition, params);

        return {
            dryRun: true,
            status: validation.valid ? 'DRY_RUN_VALID' : 'DRY_RUN_INVALID',
            scriptName,
            preview: {
                script: {
                    name: definition.name,
                    version: definition.version,
                    description: definition.description,
                    requireIntegrationInstance: definition.config?.requireIntegrationInstance || false,
                },
                input: params,
                inputSchema: definition.inputSchema || null,
                validation,
            },
            message: validation.valid
                ? 'Dry-run validation passed. Script is ready to execute with provided parameters.'
                : `Dry-run validation failed: ${validation.errors.join(', ')}`,
        };
    }

    /**
     * Validate parameters against script's input schema
     *
     * @param {Object} definition - Script definition
     * @param {Object} params - Input parameters
     * @returns {Object} Validation result { valid, errors }
     */
    validateParams(definition, params) {
        const errors = [];
        const schema = definition.inputSchema;

        if (!schema) {
            return { valid: true, errors: [] };
        }

        // Check required fields
        if (schema.required && Array.isArray(schema.required)) {
            for (const field of schema.required) {
                if (params[field] === undefined || params[field] === null) {
                    errors.push(`Missing required parameter: ${field}`);
                }
            }
        }

        // Basic type validation for properties
        if (schema.properties) {
            for (const [key, prop] of Object.entries(schema.properties)) {
                const value = params[key];
                if (value !== undefined && value !== null) {
                    const typeError = this.validateType(key, value, prop);
                    if (typeError) {
                        errors.push(typeError);
                    }
                }
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * Validate a single parameter type
     */
    validateType(key, value, schema) {
        const expectedType = schema.type;
        if (!expectedType) return null;

        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (expectedType === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
            return `Parameter "${key}" must be an integer`;
        }
        if (expectedType === 'number' && typeof value !== 'number') {
            return `Parameter "${key}" must be a number`;
        }
        if (expectedType === 'string' && typeof value !== 'string') {
            return `Parameter "${key}" must be a string`;
        }
        if (expectedType === 'boolean' && typeof value !== 'boolean') {
            return `Parameter "${key}" must be a boolean`;
        }
        if (expectedType === 'array' && !Array.isArray(value)) {
            return `Parameter "${key}" must be an array`;
        }
        if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
            return `Parameter "${key}" must be an object`;
        }

        return null;
    }
}

function createScriptRunner(params = {}) {
    return new ScriptRunner(params);
}

module.exports = { ScriptRunner, createScriptRunner };
