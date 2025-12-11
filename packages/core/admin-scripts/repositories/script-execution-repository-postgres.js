const { prisma } = require('../../database/prisma');
const {
    ScriptExecutionRepositoryInterface,
} = require('./script-execution-repository-interface');

/**
 * PostgreSQL Script Execution Repository Adapter
 * Handles script execution persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 * - logs field is Json[] - supports push operations
 */
class ScriptExecutionRepositoryPostgres extends ScriptExecutionRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = Number.parseInt(id, 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert execution object IDs to strings
     * @private
     * @param {Object|null} execution - Execution object from database
     * @returns {Object|null} Execution with string IDs
     */
    _convertExecutionIds(execution) {
        if (!execution) return execution;
        return {
            ...execution,
            id: execution.id?.toString(),
        };
    }

    /**
     * Create a new script execution record
     *
     * @param {Object} params - Execution creation parameters
     * @param {string} params.scriptName - Name of the script being executed
     * @param {string} [params.scriptVersion] - Version of the script
     * @param {string} params.trigger - Trigger type
     * @param {string} [params.mode] - Execution mode ('sync' or 'async', default 'async')
     * @param {Object} [params.input] - Input parameters for the script
     * @param {Object} [params.audit] - Audit information
     * @param {string} [params.audit.apiKeyName] - Name of API key used
     * @param {string} [params.audit.apiKeyLast4] - Last 4 chars of API key
     * @param {string} [params.audit.ipAddress] - IP address of requester
     * @returns {Promise<Object>} The created execution record with string ID
     */
    async createExecution({ scriptName, scriptVersion, trigger, mode, input, audit }) {
        const data = {
            scriptName,
            scriptVersion,
            trigger,
            mode: mode || 'async',
            input,
            logs: [],
        };

        // Map audit object to separate fields
        if (audit) {
            if (audit.apiKeyName) data.auditApiKeyName = audit.apiKeyName;
            if (audit.apiKeyLast4) data.auditApiKeyLast4 = audit.apiKeyLast4;
            if (audit.ipAddress) data.auditIpAddress = audit.ipAddress;
        }

        const execution = await this.prisma.scriptExecution.create({
            data,
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Find an execution by its ID
     *
     * @param {string|number} id - The execution ID
     * @returns {Promise<Object|null>} The execution record with string ID or null if not found
     */
    async findExecutionById(id) {
        const intId = this._convertId(id);
        const execution = await this.prisma.scriptExecution.findUnique({
            where: { id: intId },
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Find all executions for a specific script
     *
     * @param {string} scriptName - The script name to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of execution records with string IDs
     */
    async findExecutionsByScriptName(scriptName, options = {}) {
        const { limit, offset, sortBy = 'createdAt', sortOrder = 'desc' } = options;

        const executions = await this.prisma.scriptExecution.findMany({
            where: { scriptName },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return executions.map((execution) => this._convertExecutionIds(execution));
    }

    /**
     * Find all executions with a specific status
     *
     * @param {string} status - Status to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of execution records with string IDs
     */
    async findExecutionsByStatus(status, options = {}) {
        const { limit, offset, sortBy = 'createdAt', sortOrder = 'desc' } = options;

        const executions = await this.prisma.scriptExecution.findMany({
            where: { status },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return executions.map((execution) => this._convertExecutionIds(execution));
    }

    /**
     * Update the status of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {string} status - New status value
     * @returns {Promise<Object>} Updated execution record with string ID
     */
    async updateExecutionStatus(id, status) {
        const intId = this._convertId(id);
        const execution = await this.prisma.scriptExecution.update({
            where: { id: intId },
            data: { status },
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Update the output result of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} output - Output data from the script
     * @returns {Promise<Object>} Updated execution record with string ID
     */
    async updateExecutionOutput(id, output) {
        const intId = this._convertId(id);
        const execution = await this.prisma.scriptExecution.update({
            where: { id: intId },
            data: { output },
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Update the error details of a failed execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} error - Error information
     * @param {string} error.name - Error name/type
     * @param {string} error.message - Error message
     * @param {string} [error.stack] - Error stack trace
     * @returns {Promise<Object>} Updated execution record with string ID
     */
    async updateExecutionError(id, error) {
        const intId = this._convertId(id);
        const execution = await this.prisma.scriptExecution.update({
            where: { id: intId },
            data: {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            },
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Update the performance metrics of an execution
     *
     * @param {string|number} id - The execution ID
     * @param {Object} metrics - Performance metrics
     * @param {Date} [metrics.startTime] - Execution start time
     * @param {Date} [metrics.endTime] - Execution end time
     * @param {number} [metrics.durationMs] - Duration in milliseconds
     * @returns {Promise<Object>} Updated execution record with string ID
     */
    async updateExecutionMetrics(id, metrics) {
        const intId = this._convertId(id);
        const data = {};
        if (metrics.startTime !== undefined) data.metricsStartTime = metrics.startTime;
        if (metrics.endTime !== undefined) data.metricsEndTime = metrics.endTime;
        if (metrics.durationMs !== undefined) data.metricsDurationMs = metrics.durationMs;

        const execution = await this.prisma.scriptExecution.update({
            where: { id: intId },
            data,
        });

        return this._convertExecutionIds(execution);
    }

    /**
     * Append a log entry to an execution's log array
     *
     * @param {string|number} id - The execution ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated execution record with string ID
     */
    async appendExecutionLog(id, logEntry) {
        const intId = this._convertId(id);

        // Get current execution
        const execution = await this.prisma.scriptExecution.findUnique({
            where: { id: intId },
        });

        if (!execution) {
            throw new Error(`Execution ${id} not found`);
        }

        // Append log entry to logs array (copy to avoid mutating original)
        const logs = Array.isArray(execution.logs) ? [...execution.logs] : [];
        logs.push(logEntry);

        // Update with new logs array
        const updated = await this.prisma.scriptExecution.update({
            where: { id: intId },
            data: { logs },
        });

        return this._convertExecutionIds(updated);
    }

    /**
     * Delete all executions older than a specific date
     * Used for cleanup and retention policies
     *
     * @param {Date} date - Delete executions older than this date
     * @returns {Promise<Object>} Deletion result with count
     */
    async deleteExecutionsOlderThan(date) {
        const result = await this.prisma.scriptExecution.deleteMany({
            where: {
                createdAt: {
                    lt: date,
                },
            },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }
}

module.exports = { ScriptExecutionRepositoryPostgres };
