/**
 * Sync Repository Interface
 * Abstract base class defining the contract for sync persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters (MongoDB, PostgreSQL) implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * @abstract
 */
class SyncRepositoryInterface {
    /**
     * Get a sync object by name, data identifier, and entity
     *
     * @param {string} name - The sync object name
     * @param {Object} dataIdentifier - The data identifier object
     * @param {string|number} entity - The entity ID
     * @returns {Promise<Object|null>} The sync object or null
     * @abstract
     */
    async getSyncObject(name, dataIdentifier, entity) {
        throw new Error('Method getSyncObject must be implemented by subclass');
    }

    /**
     * Create or update a sync object
     *
     * @param {Object} filter - Filter criteria for finding existing sync
     * @param {Object} syncData - Sync data to create/update
     * @returns {Promise<Object>} The created or updated sync object
     * @abstract
     */
    async upsertSync(filter, syncData) {
        throw new Error('Method upsertSync must be implemented by subclass');
    }

    /**
     * Update a sync object by ID
     *
     * @param {string|number} id - The sync object ID
     * @param {Object} updates - Updates to apply
     * @returns {Promise<Object>} The updated sync object
     * @abstract
     */
    async updateSync(id, updates) {
        throw new Error('Method updateSync must be implemented by subclass');
    }

    /**
     * Add a data identifier to a sync object
     *
     * @param {string|number} syncId - The sync object ID
     * @param {Object} dataIdentifier - The data identifier to add
     * @returns {Promise<Object>} The updated sync object
     * @abstract
     */
    async addDataIdentifier(syncId, dataIdentifier) {
        throw new Error('Method addDataIdentifier must be implemented by subclass');
    }

    /**
     * Get entity object ID for entity ID from sync object
     * This is a pure helper method (no database access)
     *
     * @param {Object} syncObj - The sync object
     * @param {string|number} entityId - The entity ID
     * @returns {Object} The entity object ID
     * @abstract
     */
    getEntityObjIdForEntityIdFromObject(syncObj, entityId) {
        throw new Error('Method getEntityObjIdForEntityIdFromObject must be implemented by subclass');
    }

    /**
     * Find sync objects by filter
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of sync objects
     * @abstract
     */
    async findSyncs(filter) {
        throw new Error('Method findSyncs must be implemented by subclass');
    }

    /**
     * Find one sync object by filter
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} The sync object or null
     * @abstract
     */
    async findOneSync(filter) {
        throw new Error('Method findOneSync must be implemented by subclass');
    }

    /**
     * Delete a sync object by ID
     *
     * @param {string|number} id - The sync object ID
     * @returns {Promise<Object>} The deletion result
     * @abstract
     */
    async deleteSync(id) {
        throw new Error('Method deleteSync must be implemented by subclass');
    }
}

module.exports = { SyncRepositoryInterface };
