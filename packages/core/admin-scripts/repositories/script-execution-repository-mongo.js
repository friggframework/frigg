const { prisma } = require('../../database/prisma');
const {
    ScriptExecutionRepositoryInterface,
} = require('./script-execution-repository-interface');

/**
 * MongoDB Script Execution Repository Adapter
 * Handles script execution persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - IDs are strings with @db.ObjectId
 * - logs field is Json[] - supports push operations
 * - Audit fields stored as separate columns
 */
class ScriptExecutionRepositoryMongo extends ScriptExecutionRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
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
     * @returns {Promise<Object>} The created execution record
     */
    async createExecution({
        scriptName,
        scriptVersion,
        trigger,
        mode,
        input,
        audit,
    }) {
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

        return execution;
    }

    /**
     * Find an execution by its ID
     *
     * @param {string} id - The execution ID
     * @returns {Promise<Object|null>} The execution record or null if not found
     */
    async findExecutionById(id) {
        const execution = await this.prisma.scriptExecution.findUnique({
            where: { id },
        });

        return execution;
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
     * @returns {Promise<Array>} Array of execution records
     */
    async findExecutionsByScriptName(scriptName, options = {}) {
        const {
            limit,
            offset,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const executions = await this.prisma.scriptExecution.findMany({
            where: { scriptName },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return executions;
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
     * @returns {Promise<Array>} Array of execution records
     */
    async findExecutionsByStatus(status, options = {}) {
        const {
            limit,
            offset,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const executions = await this.prisma.scriptExecution.findMany({
            where: { status },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return executions;
    }

    /**
     * Update the status of an execution
     *
     * @param {string} id - The execution ID
     * @param {string} status - New status value
     * @returns {Promise<Object>} Updated execution record
     */
    async updateExecutionStatus(id, status) {
        const execution = await this.prisma.scriptExecution.update({
            where: { id },
            data: { status },
        });

        return execution;
    }

    /**
     * Update the output result of an execution
     *
     * @param {string} id - The execution ID
     * @param {Object} output - Output data from the script
     * @returns {Promise<Object>} Updated execution record
     */
    async updateExecutionOutput(id, output) {
        const execution = await this.prisma.scriptExecution.update({
            where: { id },
            data: { output },
        });

        return execution;
    }

    /**
     * Update the error details of a failed execution
     *
     * @param {string} id - The execution ID
     * @param {Object} error - Error information
     * @param {string} error.name - Error name/type
     * @param {string} error.message - Error message
     * @param {string} [error.stack] - Error stack trace
     * @returns {Promise<Object>} Updated execution record
     */
    async updateExecutionError(id, error) {
        const execution = await this.prisma.scriptExecution.update({
            where: { id },
            data: {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
            },
        });

        return execution;
    }

    /**
     * Update the performance metrics of an execution
     *
     * @param {string} id - The execution ID
     * @param {Object} metrics - Performance metrics
     * @param {Date} [metrics.startTime] - Execution start time
     * @param {Date} [metrics.endTime] - Execution end time
     * @param {number} [metrics.durationMs] - Duration in milliseconds
     * @returns {Promise<Object>} Updated execution record
     */
    async updateExecutionMetrics(id, metrics) {
        const data = {};
        if (metrics.startTime !== undefined)
            data.metricsStartTime = metrics.startTime;
        if (metrics.endTime !== undefined)
            data.metricsEndTime = metrics.endTime;
        if (metrics.durationMs !== undefined)
            data.metricsDurationMs = metrics.durationMs;

        const execution = await this.prisma.scriptExecution.update({
            where: { id },
            data,
        });

        return execution;
    }

    /**
     * Append a log entry to an execution's log array
     *
     * @param {string} id - The execution ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated execution record
     */
    async appendExecutionLog(id, logEntry) {
        // Get current execution
        const execution = await this.prisma.scriptExecution.findUnique({
            where: { id },
        });

        if (!execution) {
            throw new Error(`Execution ${id} not found`);
        }

        // Append log entry to logs array (copy to avoid mutating original)
        const logs = Array.isArray(execution.logs) ? [...execution.logs] : [];
        logs.push(logEntry);

        // Update with new logs array
        const updated = await this.prisma.scriptExecution.update({
            where: { id },
            data: { logs },
        });

        return updated;
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

module.exports = { ScriptExecutionRepositoryMongo };
