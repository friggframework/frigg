const { prisma } = require('../../database/prisma');
const {
    AdminProcessRepositoryInterface,
} = require('./admin-process-repository-interface');

/**
 * PostgreSQL Admin Process Repository Adapter
 * Handles admin process persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 * - context and results are Json objects
 */
class AdminProcessRepositoryPostgres extends AdminProcessRepositoryInterface {
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
     * Convert process object IDs to strings
     * @private
     * @param {Object|null} process - Process object from database
     * @returns {Object|null} Process with string IDs
     */
    _convertProcessIds(process) {
        if (!process) return process;
        return {
            ...process,
            id: process.id?.toString(),
            parentProcessId: process.parentProcessId?.toString(),
        };
    }

    /**
     * Create a new admin process record
     *
     * @param {Object} params - Process creation parameters
     * @param {string} params.name - Name of the process
     * @param {string} params.type - Type of process (e.g., 'ADMIN_SCRIPT', 'DB_MIGRATION')
     * @param {Object} [params.context] - Context data
     * @returns {Promise<Object>} The created process record with string ID
     */
    async createProcess({ name, type, context = {} }) {
        const data = {
            name,
            type,
            context,
            results: { logs: [] },
        };

        const process = await this.prisma.adminProcess.create({
            data,
        });

        return this._convertProcessIds(process);
    }

    /**
     * Find a process by its ID
     *
     * @param {string|number} id - The process ID
     * @returns {Promise<Object|null>} The process record with string ID or null if not found
     */
    async findProcessById(id) {
        const intId = this._convertId(id);
        const process = await this.prisma.adminProcess.findUnique({
            where: { id: intId },
        });

        return this._convertProcessIds(process);
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
     * @returns {Promise<Array>} Array of process records with string IDs
     */
    async findProcessesByName(name, options = {}) {
        const { limit, offset, sortBy = 'createdAt', sortOrder = 'desc' } = options;

        const processes = await this.prisma.adminProcess.findMany({
            where: { name },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return processes.map((process) => this._convertProcessIds(process));
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
     * @returns {Promise<Array>} Array of process records with string IDs
     */
    async findProcessesByState(state, options = {}) {
        const { limit, offset, sortBy = 'createdAt', sortOrder = 'desc' } = options;

        const processes = await this.prisma.adminProcess.findMany({
            where: { state },
            orderBy: { [sortBy]: sortOrder },
            take: limit,
            skip: offset,
        });

        return processes.map((process) => this._convertProcessIds(process));
    }

    /**
     * Update the state of a process
     *
     * @param {string|number} id - The process ID
     * @param {string} state - New state value
     * @returns {Promise<Object>} Updated process record with string ID
     */
    async updateProcessState(id, state) {
        const intId = this._convertId(id);
        const process = await this.prisma.adminProcess.update({
            where: { id: intId },
            data: { state },
        });

        return this._convertProcessIds(process);
    }

    /**
     * Update the results of a process
     * Merges new results with existing results
     *
     * @param {string|number} id - The process ID
     * @param {Object} results - Results data to merge
     * @returns {Promise<Object>} Updated process record with string ID
     */
    async updateProcessResults(id, results) {
        const intId = this._convertId(id);

        // Get current process to merge results
        const currentProcess = await this.prisma.adminProcess.findUnique({
            where: { id: intId },
        });

        if (!currentProcess) {
            throw new Error(`AdminProcess ${id} not found`);
        }

        // Merge new results with existing results
        const mergedResults = {
            ...(currentProcess.results || {}),
            ...results,
        };

        const process = await this.prisma.adminProcess.update({
            where: { id: intId },
            data: { results: mergedResults },
        });

        return this._convertProcessIds(process);
    }

    /**
     * Append a log entry to a process's log array in results
     *
     * @param {string|number} id - The process ID
     * @param {Object} logEntry - Log entry to append
     * @param {string} logEntry.level - Log level ('debug', 'info', 'warn', 'error')
     * @param {string} logEntry.message - Log message
     * @param {Object} [logEntry.data] - Additional log data
     * @param {string} logEntry.timestamp - ISO timestamp
     * @returns {Promise<Object>} Updated process record with string ID
     */
    async appendProcessLog(id, logEntry) {
        const intId = this._convertId(id);

        // Get current process
        const process = await this.prisma.adminProcess.findUnique({
            where: { id: intId },
        });

        if (!process) {
            throw new Error(`AdminProcess ${id} not found`);
        }

        // Get current results and logs
        const results = process.results || {};
        const logs = Array.isArray(results.logs) ? [...results.logs] : [];
        logs.push(logEntry);

        // Update with new logs array in results
        const updated = await this.prisma.adminProcess.update({
            where: { id: intId },
            data: { results: { ...results, logs } },
        });

        return this._convertProcessIds(updated);
    }

    /**
     * Delete all processes older than a specific date
     * Used for cleanup and retention policies
     *
     * @param {Date} date - Delete processes older than this date
     * @returns {Promise<Object>} Deletion result with count
     */
    async deleteProcessesOlderThan(date) {
        const result = await this.prisma.adminProcess.deleteMany({
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

module.exports = { AdminProcessRepositoryPostgres };
