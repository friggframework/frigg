const { prisma } = require('../../database/prisma');
const {
    AdminScriptExecutionRepositoryInterface,
} = require('./admin-script-execution-repository-interface');

/**
 * MongoDB Admin Process Repository Adapter
 * Handles admin process persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - IDs are strings with @db.ObjectId
 * - context and results are Json objects
 * - Stores logs in results.logs array
 */
class AdminScriptExecutionRepositoryMongo extends AdminScriptExecutionRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Create a new admin process record
     *
     * @param {Object} params - Process creation parameters
     * @param {string} params.name - Name of the process
     * @param {string} params.type - Type of process (e.g., 'ADMIN_SCRIPT', 'DB_MIGRATION')
     * @param {Object} [params.context] - Context data
     * @returns {Promise<Object>} The created process record
     */
    async createExecution({ name, type, context = {} }) {
        const data = {
            name,
            type,
            context,
            results: { logs: [] },
        };

        const process = await this.prisma.adminScriptExecution.create({
            data,
        });

        return process;
    }

    /**
     * Find a process by its ID
     *
     * @param {string} id - The process ID
     * @returns {Promise<Object|null>} The process record or null if not found
     */
    async findExecutionById(id) {
        const process = await this.prisma.adminScriptExecution.findUnique({
            where: { id },
        });

        return process;
    }

    /**
     * Find all processes with a specific name
     *
     * @param {string} name - The process name to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of process records
     */
    async findExecutionsByName(name, options = {}) {
        const {
            limit,
            offset,
            sortBy = 'createdAt',
            sortOrder = 'desc',
            state,
        } = options;

        const where = { name };
        if (state) where.state = state;

        const processes = await this.prisma.adminScriptExecution.findMany({
            where,
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return processes;
    }

    /**
     * Find all processes with a specific state
     *
     * @param {string} state - State to filter by
     * @param {Object} [options] - Query options
     * @param {number} [options.limit] - Maximum number of results
     * @param {number} [options.offset] - Number of results to skip
     * @param {string} [options.sortBy] - Field to sort by
     * @param {string} [options.sortOrder] - Sort order ('asc' or 'desc')
     * @returns {Promise<Array>} Array of process records
     */
    async findExecutionsByState(state, options = {}) {
        const {
            limit,
            offset,
            sortBy = 'createdAt',
            sortOrder = 'desc',
        } = options;

        const processes = await this.prisma.adminScriptExecution.findMany({
            where: { state },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return processes;
    }

    /**
     * Update the state of a process
     *
     * @param {string} id - The process ID
     * @param {string} state - New state value
     * @returns {Promise<Object>} Updated process record
     */
    async updateExecutionState(id, state) {
        const process = await this.prisma.adminScriptExecution.update({
            where: { id },
            data: { state },
        });

        return process;
    }

    /**
     * Update the results of a process
     * Merges new results with existing results
     *
     * @param {string} id - The process ID
     * @param {Object} results - Results data to merge
     * @returns {Promise<Object>} Updated process record
     */
    async updateExecutionResults(id, results) {
        // Get current process to merge results
        const currentProcess = await this.prisma.adminScriptExecution.findUnique({
            where: { id },
        });

        if (!currentProcess) {
            throw new Error(`AdminScriptExecution ${id} not found`);
        }

        // Merge new results with existing results
        const mergedResults = {
            ...(currentProcess.results || {}),
            ...results,
        };

        const process = await this.prisma.adminScriptExecution.update({
            where: { id },
            data: { results: mergedResults },
        });

        return process;
    }

    /**
     * Append a log entry to a process's log array in results
     *
     * @param {string} id - The process ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated process record
     */
    async appendExecutionLog(id, logEntry) {
        // Get current process
        const process = await this.prisma.adminScriptExecution.findUnique({
            where: { id },
        });

        if (!process) {
            throw new Error(`AdminScriptExecution ${id} not found`);
        }

        // Get current results and logs
        const results = process.results || {};
        const logs = Array.isArray(results.logs) ? [...results.logs] : [];
        logs.push(logEntry);

        // Update with new logs array in results
        const updated = await this.prisma.adminScriptExecution.update({
            where: { id },
            data: { results: { ...results, logs } },
        });

        return updated;
    }

    /**
     * Delete all processes older than a specific date
     * Used for cleanup and retention policies
     *
     * @param {Date} date - Delete processes older than this date
     * @returns {Promise<Object>} Deletion result with count
     */
    async deleteExecutionsOlderThan(date) {
        const result = await this.prisma.adminScriptExecution.deleteMany({
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

module.exports = { AdminScriptExecutionRepositoryMongo };
