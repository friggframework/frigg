const { prisma } = require('../../database/prisma');
const { SyncRepositoryInterface } = require('./sync-repository-interface');

/**
 * PostgreSQL Sync Repository Adapter
 * Handles sync persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses implicit join tables for entity relations (_EntityToSync)
 * - IDs are integers with auto-increment
 * - Uses connect/disconnect syntax for relations
 *
 * Key differences from MongoDB:
 * - entities: { connect: [...] } instead of entityIds: [string]
 * - No entityIds scalar field in schema
 */
class SyncRepositoryPostgres extends SyncRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Get a sync object by name, data identifier, and entity
     *
     * @param {string} name - The sync object name
     * @param {Object} dataIdentifier - The data identifier object
     * @param {number} entity - The entity ID (PostgreSQL integer)
     * @returns {Promise<Object|null>} The sync object or null
     */
    async getSyncObject(name, dataIdentifier, entity) {
        const syncList = await this.prisma.sync.findMany({
            where: {
                name,
                dataIdentifiers: {
                    some: {
                        idData: dataIdentifier,
                        entityId: entity,
                    },
                },
            },
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });

        if (syncList.length === 1) {
            return syncList[0];
        } else if (syncList.length === 0) {
            return null;
        } else {
            throw new Error(
                `There are multiple sync objects with the name ${name}, for entities [${syncList[0].entities}] [${syncList[1].entities}]`
            );
        }
    }

    /**
     * Create or update a sync object
     *
     * @param {Object} filter - Filter criteria for finding existing sync
     * @param {Object} syncData - Sync data to create/update
     * @returns {Promise<Object>} The created or updated sync object
     */
    async upsertSync(filter, syncData) {
        // Find existing sync
        const where = this._convertFilterToWhere(filter);
        const existing = await this.prisma.sync.findFirst({ where });

        if (existing) {
            // Update existing
            return await this.prisma.sync.update({
                where: { id: existing.id },
                data: syncData,
            });
        }

        // Create new
        return await this.prisma.sync.create({
            data: syncData,
        });
    }

    /**
     * Update a sync object by ID
     *
     * @param {number} id - The sync object ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} The updated sync object
     */
    async updateSync(id, updates) {
        return await this.prisma.sync.update({
            where: { id },
            data: updates,
        });
    }

    /**
     * Add a data identifier to a sync object
     *
     * @param {number} syncId - The sync object ID
     * @param {Object} dataIdentifier - The data identifier to add
     * @returns {Promise<Object>} The updated sync object
     */
    async addDataIdentifier(syncId, dataIdentifier) {
        // In Prisma, we create a new DataIdentifier record linked to the Sync
        await this.prisma.dataIdentifier.create({
            data: {
                syncId,
                entityId: dataIdentifier.entity,
                idData: dataIdentifier.id,
                hash: dataIdentifier.hash,
            },
        });

        // Return updated sync object
        return await this.prisma.sync.findUnique({
            where: { id: syncId },
            include: {
                dataIdentifiers: true,
            },
        });
    }

    /**
     * Get entity object ID for entity ID from sync object
     *
     * This is a pure helper method (no database access)
     *
     * @param {Object} syncObj - The sync object
     * @param {number} entityId - The entity ID
     * @returns {Object} The entity object ID
     */
    getEntityObjIdForEntityIdFromObject(syncObj, entityId) {
        if (!syncObj.dataIdentifiers) {
            throw new Error('Sync object must include dataIdentifiers');
        }

        for (let dataIdentifier of syncObj.dataIdentifiers) {
            if (dataIdentifier.entityId === entityId) {
                return dataIdentifier.idData;
            }
        }

        throw new Error(
            `Sync object ${syncObj.id} does not contain a data identifier for entity ${entityId}`
        );
    }

    /**
     * Find sync objects by filter
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of sync objects
     */
    async findSyncs(filter) {
        const where = this._convertFilterToWhere(filter);
        return await this.prisma.sync.findMany({
            where,
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });
    }

    /**
     * Find one sync object by filter
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} The sync object or null
     */
    async findOneSync(filter) {
        const where = this._convertFilterToWhere(filter);
        return await this.prisma.sync.findFirst({
            where,
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });
    }

    /**
     * Delete a sync object by ID
     *
     * @param {number} id - The sync object ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteSync(id) {
        // Prisma will cascade delete dataIdentifiers automatically
        return await this.prisma.sync.delete({
            where: { id },
        });
    }

    /**
     * Convert Mongoose-style filter to Prisma where clause
     * @private
     * @param {Object} filter - Mongoose filter
     * @returns {Object} Prisma where clause
     */
    _convertFilterToWhere(filter) {
        const where = {};

        // Handle _id field (Mongoose uses _id, Prisma uses id)
        if (filter._id) {
            where.id = filter._id;
            delete filter._id;
        }

        // Copy remaining filters
        return { ...where, ...filter };
    }
}

module.exports = { SyncRepositoryPostgres };
