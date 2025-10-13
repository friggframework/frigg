const { prisma } = require('../../database/prisma');
const { ProcessRepositoryInterface } = require('./process-repository-interface');

/**
 * MongoDB Process Repository Adapter
 * Handles process persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - Uses scalar fields for relations (userId, integrationId)
 * - IDs are strings with @db.ObjectId
 * - JSON fields for flexible context and results storage
 * - Array field for childProcesses references
 *
 * Design Philosophy:
 * - Generic Process model supports any type of long-running operation
 * - Context and results stored as JSON for maximum flexibility
 * - Integration-specific logic lives in use cases and services
 */
class ProcessRepositoryMongo extends ProcessRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Create a new process record
     * @param {Object} processData - Process data to create
     * @returns {Promise<Object>} Created process record
     */
    async create(processData) {
        const process = await this.prisma.process.create({
            data: {
                userId: processData.userId,
                integrationId: processData.integrationId,
                name: processData.name,
                type: processData.type,
                state: processData.state || 'INITIALIZING',
                context: processData.context || {},
                results: processData.results || {},
                childProcesses: processData.childProcesses || [],
                parentProcessId: processData.parentProcessId || null,
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
            where: { id: processId },
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
            updateData.parentProcessId = updates.parentProcessId;
        }

        const process = await this.prisma.process.update({
            where: { id: processId },
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
                integrationId,
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
                integrationId,
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
            where: { id: processId },
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
            id: process.id,
            userId: process.userId,
            integrationId: process.integrationId,
            name: process.name,
            type: process.type,
            state: process.state,
            context: process.context,
            results: process.results,
            childProcesses: process.childProcesses,
            parentProcessId: process.parentProcessId,
            createdAt: process.createdAt,
            updatedAt: process.updatedAt,
        };
    }
}

module.exports = { ProcessRepositoryMongo };

