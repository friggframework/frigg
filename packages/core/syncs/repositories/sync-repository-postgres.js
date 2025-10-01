const { prisma } = require('../../database/prisma');
const { SyncRepositoryInterface } = require('./sync-repository-interface');

/**
 * PostgreSQL Sync Repository Adapter
 * Handles sync persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses implicit join tables for entity relations (_EntityToSync)
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 * - Uses connect/disconnect syntax for relations
 */
class SyncRepositoryPostgres extends SyncRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
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
     * Convert sync object IDs to strings
     * @private
     * @param {Object|null} sync - Sync object from database
     * @returns {Object|null} Sync with string IDs
     */
    _convertSyncIds(sync) {
        if (!sync) return sync;
        return {
            ...sync,
            id: sync.id?.toString(),
            integrationId: sync.integrationId?.toString(),
            entities: sync.entities?.map(e => ({
                ...e,
                id: e.id?.toString(),
                userId: e.userId?.toString(),
                credentialId: e.credentialId?.toString()
            })),
            dataIdentifiers: sync.dataIdentifiers?.map(di => ({
                ...di,
                id: di.id?.toString(),
                syncId: di.syncId?.toString(),
                entityId: di.entityId?.toString(),
                entity: di.entity ? {
                    ...di.entity,
                    id: di.entity.id?.toString(),
                    userId: di.entity.userId?.toString(),
                    credentialId: di.entity.credentialId?.toString()
                } : di.entity
            }))
        };
    }

    /**
     * Get a sync object by name, data identifier, and entity
     *
     * @param {string} name - The sync object name
     * @param {Object} dataIdentifier - The data identifier object
     * @param {string} entity - The entity ID (string from application layer)
     * @returns {Promise<Object|null>} The sync object with string IDs or null
     */
    async getSyncObject(name, dataIdentifier, entity) {
        const intEntityId = this._convertId(entity);
        const syncList = await this.prisma.sync.findMany({
            where: {
                name,
                dataIdentifiers: {
                    some: {
                        idData: dataIdentifier,
                        entityId: intEntityId,
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
            return this._convertSyncIds(syncList[0]);
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
     * @param {Object} syncData - Sync data to create/update (with string IDs from application layer)
     * @returns {Promise<Object>} The created or updated sync object with string IDs
     */
    async upsertSync(filter, syncData) {
        // Find existing sync
        const where = this._convertFilterToWhere(filter);
        const existing = await this.prisma.sync.findFirst({ where });

        // Convert IDs in syncData if present
        const convertedData = { ...syncData };
        if (convertedData.integrationId) {
            convertedData.integrationId = this._convertId(convertedData.integrationId);
        }

        if (existing) {
            // Update existing
            const updated = await this.prisma.sync.update({
                where: { id: existing.id },
                data: convertedData,
            });
            return this._convertSyncIds(updated);
        }

        // Create new
        const created = await this.prisma.sync.create({
            data: convertedData,
        });
        return this._convertSyncIds(created);
    }

    /**
     * Update a sync object by ID
     *
     * @param {string} id - The sync object ID (string from application layer)
     * @param {Object} updates - Updates to apply (with string IDs from application layer)
     * @returns {Promise<Object>} The updated sync object with string IDs
     */
    async updateSync(id, updates) {
        const intId = this._convertId(id);

        // Convert IDs in updates if present
        const convertedUpdates = { ...updates };
        if (convertedUpdates.integrationId) {
            convertedUpdates.integrationId = this._convertId(convertedUpdates.integrationId);
        }

        const updated = await this.prisma.sync.update({
            where: { id: intId },
            data: convertedUpdates,
        });
        return this._convertSyncIds(updated);
    }

    /**
     * Add a data identifier to a sync object
     *
     * @param {string} syncId - The sync object ID (string from application layer)
     * @param {Object} dataIdentifier - The data identifier to add (with string entity ID)
     * @returns {Promise<Object>} The updated sync object with string IDs
     */
    async addDataIdentifier(syncId, dataIdentifier) {
        const intSyncId = this._convertId(syncId);
        const intEntityId = this._convertId(dataIdentifier.entity);

        // In Prisma, we create a new DataIdentifier record linked to the Sync
        await this.prisma.dataIdentifier.create({
            data: {
                syncId: intSyncId,
                entityId: intEntityId,
                idData: dataIdentifier.id,
                hash: dataIdentifier.hash,
            },
        });

        // Return updated sync object
        const sync = await this.prisma.sync.findUnique({
            where: { id: intSyncId },
            include: {
                dataIdentifiers: true,
            },
        });
        return this._convertSyncIds(sync);
    }

    /**
     * Get entity object ID for entity ID from sync object
     *
     * This is a pure helper method (no database access)
     *
     * @param {Object} syncObj - The sync object (with string IDs from application layer)
     * @param {string} entityId - The entity ID (string from application layer)
     * @returns {Object} The entity object ID
     */
    getEntityObjIdForEntityIdFromObject(syncObj, entityId) {
        if (!syncObj.dataIdentifiers) {
            throw new Error('Sync object must include dataIdentifiers');
        }

        for (let dataIdentifier of syncObj.dataIdentifiers) {
            // Compare string IDs (both should be strings at this point)
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
     * @param {Object} filter - Filter criteria (with string IDs from application layer)
     * @returns {Promise<Array>} Array of sync objects with string IDs
     */
    async findSyncs(filter) {
        const where = this._convertFilterToWhere(filter);
        const syncs = await this.prisma.sync.findMany({
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
        return syncs.map(sync => this._convertSyncIds(sync));
    }

    /**
     * Find one sync object by filter
     *
     * @param {Object} filter - Filter criteria (with string IDs from application layer)
     * @returns {Promise<Object|null>} The sync object with string IDs or null
     */
    async findOneSync(filter) {
        const where = this._convertFilterToWhere(filter);
        const sync = await this.prisma.sync.findFirst({
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
        return this._convertSyncIds(sync);
    }

    /**
     * Delete a sync object by ID
     *
     * @param {string} id - The sync object ID (string from application layer)
     * @returns {Promise<Object>} The deletion result with string IDs
     */
    async deleteSync(id) {
        const intId = this._convertId(id);
        // Prisma will cascade delete dataIdentifiers automatically
        const deleted = await this.prisma.sync.delete({
            where: { id: intId },
        });
        return this._convertSyncIds(deleted);
    }

    /**
     * Convert Mongoose-style filter to Prisma where clause (converting IDs to Int)
     * @private
     * @param {Object} filter - Mongoose filter (with string IDs from application layer)
     * @returns {Object} Prisma where clause (with Int IDs for PostgreSQL)
     */
    _convertFilterToWhere(filter) {
        const where = {};

        // Handle _id field (Mongoose uses _id, Prisma uses id)
        if (filter._id) {
            where.id = this._convertId(filter._id);
        }

        // Handle id field
        if (filter.id) {
            where.id = this._convertId(filter.id);
        }

        // Handle integrationId field
        if (filter.integrationId) {
            where.integrationId = this._convertId(filter.integrationId);
        }

        // Handle integration field (Mongoose uses integration, Prisma uses integrationId)
        if (filter.integration) {
            where.integrationId = this._convertId(filter.integration);
        }

        // Copy non-ID fields
        const { _id, id, integrationId, integration, ...rest } = filter;
        return { ...where, ...rest };
    }
}

module.exports = { SyncRepositoryPostgres };
