const { Sync } = require('./model');

/**
 * Repository for Sync operations.
 * Handles persistence of sync objects for bidirectional data synchronization.
 */
class SyncRepository {
    /**
     * Get a sync object by name, data identifier, and entity
     * @param {string} name - The sync object name
     * @param {Object} dataIdentifier - The data identifier object
     * @param {string} entity - The entity ID
     * @returns {Promise<Object|null>} The sync object or null
     */
    async getSyncObject(name, dataIdentifier, entity) {
        return await Sync.getSyncObject(name, dataIdentifier, entity);
    }

    /**
     * Create or update a sync object
     * @param {Object} filter - Filter criteria for finding existing sync
     * @param {Object} syncData - Sync data to create/update
     * @returns {Promise<Object>} The created or updated sync object
     */
    async upsertSync(filter, syncData) {
        return await Sync.upsert(filter, syncData);
    }

    /**
     * Update a sync object by ID
     * @param {string} id - The sync object ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} The updated sync object
     */
    async updateSync(id, updates) {
        return await Sync.update({ _id: id }, updates);
    }

    /**
     * Add a data identifier to a sync object
     * @param {string} syncId - The sync object ID
     * @param {Object} dataIdentifier - The data identifier to add
     * @returns {Promise<Object>} The updated sync object
     */
    async addDataIdentifier(syncId, dataIdentifier) {
        return await Sync.addDataIdentifier(syncId, dataIdentifier);
    }

    /**
     * Get entity object ID for entity ID from sync object
     * @param {Object} syncObj - The sync object
     * @param {string} entityId - The entity ID
     * @returns {Object} The entity object ID
     */
    getEntityObjIdForEntityIdFromObject(syncObj, entityId) {
        return Sync.getEntityObjIdForEntityIdFromObject(syncObj, entityId);
    }

    /**
     * Find sync objects by filter
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of sync objects
     */
    async findSyncs(filter) {
        return await Sync.find(filter);
    }

    /**
     * Find one sync object by filter
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} The sync object or null
     */
    async findOneSync(filter) {
        return await Sync.findOne(filter);
    }

    /**
     * Delete a sync object by ID
     * @param {string} id - The sync object ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteSync(id) {
        return await Sync.deleteOne({ _id: id });
    }
}

module.exports = { SyncRepository };