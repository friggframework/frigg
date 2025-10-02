/**
 * Module Repository Interface
 * Abstract base class defining the contract for Entity (module) persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, Entity model has identical structure across MongoDB and PostgreSQL,
 * so ModuleRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class ModuleRepositoryInterface {
    /**
     * Find entity by ID with credential
     *
     * @param {string|number} entityId - Entity ID
     * @returns {Promise<Object>} Entity object
     * @abstract
     */
    async findEntityById(entityId) {
        throw new Error(
            'Method findEntityById must be implemented by subclass'
        );
    }

    /**
     * Find all entities for a user
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Array>} Array of entity objects
     * @abstract
     */
    async findEntitiesByUserId(userId) {
        throw new Error(
            'Method findEntitiesByUserId must be implemented by subclass'
        );
    }

    /**
     * Find entities by IDs
     *
     * @param {Array<string|number>} entitiesIds - Array of entity IDs
     * @returns {Promise<Array>} Array of entity objects
     * @abstract
     */
    async findEntitiesByIds(entitiesIds) {
        throw new Error(
            'Method findEntitiesByIds must be implemented by subclass'
        );
    }

    /**
     * Find entities by user ID and module name
     *
     * @param {string|number} userId - User ID
     * @param {string} moduleName - Module name
     * @returns {Promise<Array>} Array of entity objects
     * @abstract
     */
    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        throw new Error(
            'Method findEntitiesByUserIdAndModuleName must be implemented by subclass'
        );
    }

    /**
     * Unset credential from entity
     *
     * @param {string|number} entityId - Entity ID
     * @returns {Promise<Object>} Update result
     * @abstract
     */
    async unsetCredential(entityId) {
        throw new Error(
            'Method unsetCredential must be implemented by subclass'
        );
    }

    /**
     * Find entity by filter
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} Entity object or null
     * @abstract
     */
    async findEntity(filter) {
        throw new Error('Method findEntity must be implemented by subclass');
    }

    /**
     * Find entities matching filter criteria
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Array>} Array of entity objects
     * @abstract
     */
    async findEntitiesBy(filter) {
        throw new Error('Method findEntitiesBy must be implemented by subclass');
    }

    /**
     * Create a new entity
     *
     * @param {Object} entityData - Entity data
     * @returns {Promise<Object>} Created entity object
     * @abstract
     */
    async createEntity(entityData) {
        throw new Error('Method createEntity must be implemented by subclass');
    }

    /**
     * Update entity by ID
     *
     * @param {string|number} entityId - Entity ID to update
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated entity object
     * @abstract
     */
    async updateEntity(entityId, updates) {
        throw new Error('Method updateEntity must be implemented by subclass');
    }

    /**
     * Delete entity by ID
     *
     * @param {string|number} entityId - Entity ID to delete
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteEntity(entityId) {
        throw new Error('Method deleteEntity must be implemented by subclass');
    }
}

module.exports = { ModuleRepositoryInterface };
