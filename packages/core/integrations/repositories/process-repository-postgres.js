const { prisma } = require('../../database/prisma');
const { ProcessRepositoryInterface } = require('./process-repository-interface');

/**
 * PostgreSQL Process Repository Adapter
 * Handles process persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses foreign key constraints for relations
 * - JSONB type for context and results (efficient querying)
 * - Array type for childProcesses references
 * - Transactional support available if needed
 *
 * Design Philosophy:
 * - Same interface as MongoDB repository
 * - Prisma abstracts away most database-specific details
 * - Minor differences in JSON handling internally managed by Prisma
 */
class ProcessRepositoryPostgres extends ProcessRepositoryInterface {
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
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Create a new process record
     * @param {Object} processData - Process data to create
     * @returns {Promise<Object>} Created process record
     */
    async create(processData) {
        const process = await this.prisma.process.create({
            data: {
                userId: this._convertId(processData.userId),
                integrationId: this._convertId(processData.integrationId),
                name: processData.name,
                type: processData.type,
                state: processData.state || 'INITIALIZING',
                context: processData.context || {},
                results: processData.results || {},
                childProcesses: processData.childProcesses || [],
                parentProcessId: this._convertId(processData.parentProcessId),
            },
        });

        return this._toPlainObject(process);
    }

    /**
     * Find a process by ID
     * @param {string} processId - Process ID to find
     * @returns {Promise<Object|null>} Process record or null if not found
     */
    async findById(processId) {
        const process = await this.prisma.process.findUnique({
            where: { id: this._convertId(processId) },
        });

        return process ? this._toPlainObject(process) : null;
    }

    /**
     * Update a process record
     * @param {string} processId - Process ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated process record
     */
    async update(processId, updates) {
        // Prepare update data, excluding undefined values
        const updateData = {};

        if (updates.state !== undefined) {
            updateData.state = updates.state;
        }
        if (updates.context !== undefined) {
            updateData.context = updates.context;
        }
        if (updates.results !== undefined) {
            updateData.results = updates.results;
        }
        if (updates.childProcesses !== undefined) {
            updateData.childProcesses = updates.childProcesses;
        }
        if (updates.parentProcessId !== undefined) {
            updateData.parentProcessId = this._convertId(updates.parentProcessId);
        }

        const process = await this.prisma.process.update({
            where: { id: this._convertId(processId) },
            data: updateData,
        });

        return this._toPlainObject(process);
    }

    /**
     * Find processes by integration and type
     * @param {string} integrationId - Integration ID
     * @param {string} type - Process type
     * @returns {Promise<Array>} Array of process records
     */
    async findByIntegrationAndType(integrationId, type) {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
                type,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return processes.map((p) => this._toPlainObject(p));
    }

    /**
     * Find active processes (not in excluded states)
     * @param {string} integrationId - Integration ID
     * @param {string[]} [excludeStates=['COMPLETED', 'ERROR']] - States to exclude
     * @returns {Promise<Array>} Array of active process records
     */
    async findActiveProcesses(integrationId, excludeStates = ['COMPLETED', 'ERROR']) {
        const processes = await this.prisma.process.findMany({
            where: {
                integrationId: this._convertId(integrationId),
                state: {
                    notIn: excludeStates,
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return processes.map((p) => this._toPlainObject(p));
    }

    /**
     * Find a process by name (most recent)
     * @param {string} name - Process name
     * @returns {Promise<Object|null>} Most recent process with given name, or null
     */
    async findByName(name) {
        const process = await this.prisma.process.findFirst({
            where: { name },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return process ? this._toPlainObject(process) : null;
    }

    /**
     * Delete a process by ID
     * @param {string} processId - Process ID to delete
     * @returns {Promise<void>}
     */
    async deleteById(processId) {
        await this.prisma.process.delete({
            where: { id: this._convertId(processId) },
        });
    }

    /**
     * Convert Prisma model to plain JavaScript object
     * Ensures consistent API across repository implementations
     * @private
     * @param {Object} process - Prisma process model
     * @returns {Object} Plain process object
     */
    _toPlainObject(process) {
        return {
            id: String(process.id),
            userId: String(process.userId),
            integrationId: String(process.integrationId),
            name: process.name,
            type: process.type,
            state: process.state,
            context: process.context,
            results: process.results,
            childProcesses: Array.isArray(process.childProcesses)
                ? (process.childProcesses.length > 0 && typeof process.childProcesses[0] === 'object' && process.childProcesses[0] !== null
                    ? process.childProcesses.map(child => String(child.id))
                    : process.childProcesses)
                : [],
            parentProcessId: process.parentProcessId !== null ? String(process.parentProcessId) : null,
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}

module.exports = { ProcessRepositoryPostgres };

