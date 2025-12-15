const ERROR_CODE_MAP = {
    SCRIPT_NOT_FOUND: 404,
    EXECUTION_NOT_FOUND: 404,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return { error: status, reason: error?.message, code: error?.code };
}

/**
 * Create admin script commands
 * Provides command pattern API for admin script management
 *
 * This follows the Command pattern from integration-commands.js:
 * - Creates repositories via factory functions
 * - Maps errors to HTTP-friendly responses
 * - Returns data or error objects (never throws)
 *
 * Authentication:
 * - Uses ENV-based ADMIN_API_KEY (see handlers/middleware/admin-auth.js)
 * - No database-backed API keys (simplified from original design)
 *
 * @returns {Object} Command methods for admin scripts
 */
function createAdminScriptCommands() {
    // Lazy-load repository factories to avoid circular dependencies
    const { createScriptExecutionRepository } = require('../../admin-scripts/repositories/script-execution-repository-factory');
    const { createScriptScheduleRepository } = require('../../admin-scripts/repositories/script-schedule-repository-factory');

    const executionRepository = createScriptExecutionRepository();
    const scheduleRepository = createScriptScheduleRepository();

    return {
        // ==================== Execution Management Commands ====================

        /**
         * Create a new script execution record
         *
         * @param {Object} params - Execution creation parameters
         * @param {string} params.scriptName - Name of script being executed
         * @param {string} [params.scriptVersion] - Script version
         * @param {string} params.trigger - Trigger type ('MANUAL', 'SCHEDULED', 'QUEUE', 'WEBHOOK')
         * @param {string} [params.mode] - Execution mode ('sync' or 'async', default 'async')
         * @param {Object} [params.input] - Input parameters
         * @param {Object} [params.audit] - Audit information (apiKeyName, apiKeyLast4, ipAddress)
         * @returns {Promise<Object>} Created execution record
         */
        async createScriptExecution({
            scriptName,
            scriptVersion,
            trigger,
            mode,
            input,
            audit,
        }) {
            try {
                const execution = await executionRepository.createExecution({
                    scriptName,
                    scriptVersion,
                    trigger,
                    mode: mode || 'async',
                    input,
                    audit,
                });
                return execution;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find a script execution by ID
         *
         * @param {string|number} executionId - The execution ID
         * @returns {Promise<Object>} Execution record or error
         */
        async findScriptExecutionById(executionId) {
            try {
                const execution = await executionRepository.findExecutionById(executionId);
                if (!execution) {
                    const error = new Error(`Execution ${executionId} not found`);
                    error.code = 'EXECUTION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }
                return execution;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find all executions for a specific script
         *
         * @param {string} scriptName - Script name to filter by
         * @param {Object} [options] - Query options (limit, offset, sortBy, sortOrder)
         * @returns {Promise<Array>} Array of execution records
         */
        async findScriptExecutionsByName(scriptName, options = {}) {
            try {
                const executions = await executionRepository.findExecutionsByScriptName(
                    scriptName,
                    options
                );
                return executions;
            } catch (error) {
                // Return empty array on error (non-critical)
                return [];
            }
        },

        /**
         * Update execution status
         *
         * @param {string|number} executionId - The execution ID
         * @param {string} status - New status ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED')
         * @returns {Promise<Object>} Updated execution record
         */
        async updateScriptExecutionStatus(executionId, status) {
            try {
                const updated = await executionRepository.updateExecutionStatus(
                    executionId,
                    status
                );
                return updated;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Append a log entry to an execution's log array
         *
         * @param {string|number} executionId - The execution ID
         * @param {Object} logEntry - Log entry { level, message, data, timestamp }
         * @returns {Promise<Object>} Updated execution record
         */
        async appendScriptExecutionLog(executionId, logEntry) {
            try {
                const updated = await executionRepository.appendExecutionLog(
                    executionId,
                    logEntry
                );
                return updated;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Complete a script execution
         * Updates status, output, error, and metrics
         *
         * @param {string|number} executionId - The execution ID
         * @param {Object} params - Completion parameters
         * @param {string} [params.status] - Final status ('COMPLETED', 'FAILED', 'TIMEOUT')
         * @param {Object} [params.output] - Script output/result
         * @param {Object} [params.error] - Error details { name, message, stack }
         * @param {Object} [params.metrics] - Performance metrics { startTime, endTime, durationMs }
         * @returns {Promise<Object>} { success: true } or error
         */
        async completeScriptExecution(executionId, { status, output, error, metrics }) {
            try {
                // Update each field independently (partial updates allowed)
                if (status) {
                    await executionRepository.updateExecutionStatus(executionId, status);
                }
                if (output !== undefined) {
                    await executionRepository.updateExecutionOutput(executionId, output);
                }
                if (error) {
                    await executionRepository.updateExecutionError(executionId, error);
                }
                if (metrics) {
                    await executionRepository.updateExecutionMetrics(executionId, metrics);
                }

                return { success: true };
            } catch (err) {
                return mapErrorToResponse(err);
            }
        },

        /**
         * Find recent executions across all scripts
         *
         * @param {Object} [options] - Query options
         * @param {number} [options.limit] - Maximum results (default 20)
         * @param {string} [options.status] - Filter by status
         * @param {Date} [options.since] - Filter by created date
         * @returns {Promise<Array>} Array of recent executions
         */
        async findRecentExecutions(options = {}) {
            try {
                const { limit = 20, status, since } = options;

                // If status filter provided, use status query
                if (status) {
                    return await executionRepository.findExecutionsByStatus(status, {
                        limit,
                        sortBy: 'createdAt',
                        sortOrder: 'desc',
                    });
                }

                // Otherwise, use generic recent query (would need to be added to interface)
                // For now, fall back to empty array if no status filter
                return [];
            } catch (error) {
                return [];
            }
        },

        // ==================== Schedule Management Commands ====================

        /**
         * Get schedule by script name
         * Returns database override or null
         *
         * @param {string} scriptName - The script name
         * @returns {Promise<Object|null>} Schedule record or null
         */
        async getScheduleByScriptName(scriptName) {
            try {
                const schedule = await scheduleRepository.findScheduleByScriptName(scriptName);
                return schedule;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Create or update a schedule (upsert)
         *
         * @param {Object} params - Schedule parameters
         * @param {string} params.scriptName - Name of the script
         * @param {boolean} params.enabled - Whether schedule is enabled
         * @param {string} params.cronExpression - Cron expression
         * @param {string} [params.timezone] - Timezone (default 'UTC')
         * @returns {Promise<Object>} Created or updated schedule
         */
        async upsertSchedule({ scriptName, enabled, cronExpression, timezone }) {
            try {
                const schedule = await scheduleRepository.upsertSchedule({
                    scriptName,
                    enabled,
                    cronExpression,
                    timezone,
                });
                return schedule;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Delete a schedule by script name
         *
         * @param {string} scriptName - The script name
         * @returns {Promise<Object>} Deletion result
         */
        async deleteSchedule(scriptName) {
            try {
                const result = await scheduleRepository.deleteSchedule(scriptName);
                return result;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update AWS EventBridge Scheduler information
         *
         * @param {string} scriptName - The script name
         * @param {Object} awsInfo - AWS schedule information
         * @param {string} [awsInfo.awsScheduleArn] - AWS EventBridge Scheduler ARN
         * @param {string} [awsInfo.awsScheduleName] - AWS EventBridge Scheduler name
         * @returns {Promise<Object>} Updated schedule
         */
        async updateScheduleAwsInfo(scriptName, { awsScheduleArn, awsScheduleName }) {
            try {
                const schedule = await scheduleRepository.updateScheduleAwsInfo(scriptName, {
                    awsScheduleArn,
                    awsScheduleName,
                });
                return schedule;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update last triggered timestamp
         * Called when a schedule triggers
         *
         * @param {string} scriptName - The script name
         * @param {Date} [timestamp] - Trigger timestamp (default: now)
         * @returns {Promise<Object>} Updated schedule
         */
        async updateScheduleLastTriggered(scriptName, timestamp) {
            try {
                const schedule = await scheduleRepository.updateScheduleLastTriggered(
                    scriptName,
                    timestamp
                );
                return schedule;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * List all schedules
         *
         * @param {Object} [options] - Query options
         * @param {boolean} [options.enabledOnly] - Only return enabled schedules
         * @returns {Promise<Array>} Array of schedule records
         */
        async listSchedules(options = {}) {
            try {
                const schedules = await scheduleRepository.listSchedules(options);
                return schedules;
            } catch (error) {
                return [];
            }
        },
    };
}

module.exports = { createAdminScriptCommands };
