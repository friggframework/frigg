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
 * WHY SEPARATE FROM integration-commands.js:
 * These commands are intentionally separate because they serve different domains:
 * - integration-commands: User-context operations on integrations
 *   - Requires integrationClass constructor parameter
 *   - Works with userId, entityIds, integration contexts
 *   - Uses IntegrationRepository, ModuleRepository
 * - admin-script-commands: System/admin operations without user context
 *   - No user context required
 *   - Works with AdminScriptExecution, ScriptSchedule
 *   - Uses AdminScriptExecutionRepository, ScriptScheduleRepository
 *
 * Merging them would violate SRP and create coupling between
 * user-facing integration code and admin/system code.
 *
 * Authentication:
 * - Uses ENV-based ADMIN_API_KEY (see handlers/middleware/admin-auth.js)
 * - No database-backed API keys (simplified from original design)
 *
 * @returns {Object} Command methods for admin scripts
 */
function createAdminScriptCommands() {
    // Lazy-load repository factories to avoid circular dependencies
    const {
        createAdminScriptExecutionRepository,
    } = require('../../admin-scripts/repositories/admin-script-execution-repository-factory');
    const {
        createScriptScheduleRepository,
    } = require('../../admin-scripts/repositories/script-schedule-repository-factory');

    const adminScriptExecutionRepository = createAdminScriptExecutionRepository();
    const scheduleRepository = createScriptScheduleRepository();

    return {
        // ==================== Admin Script Execution Management Commands ====================

        /**
         * Create a new admin script execution record
         *
         * @param {Object} params - Execution creation parameters
         * @param {string} params.scriptName - Name of script being executed
         * @param {string} [params.scriptVersion] - Script version
         * @param {string} params.trigger - Trigger type ('MANUAL', 'SCHEDULED', 'QUEUE', 'WEBHOOK')
         * @param {string} [params.mode] - Execution mode ('sync' or 'async', default 'async')
         * @param {Object} [params.input] - Input parameters
         * @param {Object} [params.audit] - Audit information (apiKeyName, apiKeyLast4, ipAddress)
         * @returns {Promise<Object>} Created admin script execution record
         */
        async createExecution({
            scriptName,
            scriptVersion,
            trigger,
            mode,
            input,
            audit,
            parentExecutionId,
        }) {
            try {
                const process = await adminScriptExecutionRepository.createExecution({
                    name: scriptName,
                    type: 'ADMIN_SCRIPT',
                    // Persisted to the parentExecutionId column (self-FK), not the
                    // context blob, so the parent/child hierarchy is queryable.
                    parentExecutionId,
                    context: {
                        scriptVersion,
                        trigger,
                        mode: mode || 'async',
                        input,
                        audit,
                    },
                });
                return process;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find an admin script execution by ID
         *
         * @param {string|number} processId - The admin script execution ID
         * @returns {Promise<Object>} Admin script execution record or error
         */
        async findExecutionById(processId) {
            try {
                const process = await adminScriptExecutionRepository.findExecutionById(
                    processId
                );
                // Scripts and reports share one store; exclude REPORT rows so the two never read each other's executions.
                if (!process || process.type === 'REPORT') {
                    const error = new Error(`Execution ${processId} not found`);
                    error.code = 'EXECUTION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }
                return process;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find all admin script executions for a specific script
         *
         * @param {string} scriptName - Script name to filter by
         * @param {Object} [options] - Query options (limit, offset, sortBy, sortOrder)
         * @returns {Promise<Array>} Array of admin script execution records
         */
        async findExecutionsByName(scriptName, options = {}) {
            try {
                const processes =
                    await adminScriptExecutionRepository.findExecutionsByName(
                        scriptName,
                        options
                    );
                return processes;
            } catch (error) {
                // Return empty array on error (non-critical)
                return [];
            }
        },

        /**
         * Update admin script execution state
         *
         * @param {string|number} processId - The admin script execution ID
         * @param {string} state - New state ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')
         * @returns {Promise<Object>} Updated admin script execution record
         */
        async updateExecutionState(processId, state) {
            try {
                const updated = await adminScriptExecutionRepository.updateExecutionState(
                    processId,
                    state
                );
                return updated;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Append a log entry to an admin script execution's results.logs array
         *
         * @param {string|number} processId - The admin script execution ID
         * @param {Object} logEntry - Log entry { level, message, data, timestamp }
         * @returns {Promise<Object>} Updated admin script execution record
         */
        async appendExecutionLog(processId, logEntry) {
            try {
                const updated = await adminScriptExecutionRepository.appendExecutionLog(
                    processId,
                    logEntry
                );
                return updated;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Complete an admin script execution
         * Updates state, output, error, and metrics
         *
         * @param {string|number} processId - The admin script execution ID
         * @param {Object} params - Completion parameters
         * @param {string} [params.state] - Final state ('COMPLETED', 'FAILED')
         * @param {Object} [params.output] - Script output/result (stored in results.output)
         * @param {Object} [params.error] - Error details { name, message, stack } (stored in results.error)
         * @param {Object} [params.metrics] - Performance metrics { startTime, endTime, durationMs } (stored in results.metrics)
         * @param {Array} [params.logs] - Execution log entries (stored in results.logs)
         * @returns {Promise<Object>} { success: true } or error
         */
        async completeExecution(
            processId,
            { state, output, error, metrics, logs }
        ) {
            try {
                if (state) {
                    await adminScriptExecutionRepository.updateExecutionState(
                        processId,
                        state
                    );
                }

                // Merge output/error/metrics/logs into the results JSON in one write
                const resultsUpdate = {};
                if (output !== undefined) resultsUpdate.output = output;
                if (error) resultsUpdate.error = error;
                if (metrics) resultsUpdate.metrics = metrics;
                if (logs) resultsUpdate.logs = logs;
                if (Object.keys(resultsUpdate).length > 0) {
                    await adminScriptExecutionRepository.updateExecutionResults(
                        processId,
                        resultsUpdate
                    );
                }

                return { success: true };
            } catch (err) {
                return mapErrorToResponse(err);
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
                const schedule =
                    await scheduleRepository.findScheduleByScriptName(
                        scriptName
                    );
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
        async upsertSchedule({
            scriptName,
            enabled,
            cronExpression,
            timezone,
        }) {
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
                const result = await scheduleRepository.deleteSchedule(
                    scriptName
                );
                return result;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update external scheduler information
         *
         * @param {string} scriptName - The script name
         * @param {Object} externalInfo - External schedule information
         * @param {string} [externalInfo.externalScheduleId] - External scheduler ID (e.g., AWS ARN)
         * @param {string} [externalInfo.externalScheduleName] - External scheduler name
         * @returns {Promise<Object>} Updated schedule
         */
        async updateScheduleExternalInfo(
            scriptName,
            { externalScheduleId, externalScheduleName }
        ) {
            try {
                const schedule =
                    await scheduleRepository.updateScheduleExternalInfo(
                        scriptName,
                        {
                            externalScheduleId,
                            externalScheduleName,
                        }
                    );
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
                const schedule =
                    await scheduleRepository.updateScheduleLastTriggered(
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
                const schedules = await scheduleRepository.listSchedules(
                    options
                );
                return schedules;
            } catch (error) {
                return [];
            }
        },
    };
}

module.exports = { createAdminScriptCommands };
