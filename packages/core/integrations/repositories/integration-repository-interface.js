/**
 * Integration Repository Interface
 * Abstract base class defining the contract for integration persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters (MongoDB, PostgreSQL) implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * @abstract
 */
class IntegrationRepositoryInterface {
    /**
     * Find all integrations for a user
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Array>} Array of integration objects
     * @abstract
     */
    async findIntegrationsByUserId(userId) {
        throw new Error('Method findIntegrationsByUserId must be implemented by subclass');
    }

    /**
     * Delete integration by ID
     *
     * @param {string|number} integrationId - Integration ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteIntegrationById(integrationId) {
        throw new Error('Method deleteIntegrationById must be implemented by subclass');
    }

    /**
     * Find integration by name
     *
     * @param {string} name - Integration type name
     * @returns {Promise<Object>} Integration object
     * @abstract
     */
    async findIntegrationByName(name) {
        throw new Error('Method findIntegrationByName must be implemented by subclass');
    }

    /**
     * Find integration by ID
     *
     * @param {string|number} id - Integration ID
     * @returns {Promise<Object>} Integration object
     * @abstract
     */
    async findIntegrationById(id) {
        throw new Error('Method findIntegrationById must be implemented by subclass');
    }

    /**
     * Update integration status
     *
     * @param {string|number} integrationId - Integration ID
     * @param {string} status - New status
     * @returns {Promise<boolean>} Success indicator
     * @abstract
     */
    async updateIntegrationStatus(integrationId, status) {
        throw new Error('Method updateIntegrationStatus must be implemented by subclass');
    }

    /**
     * Update integration messages
     *
     * @param {string|number} integrationId - Integration ID
     * @param {string} messageType - Type of message (errors, warnings, info, logs)
     * @param {string} messageTitle - Message title
     * @param {string} messageBody - Message body
     * @param {Date} messageTimestamp - Message timestamp
     * @returns {Promise<boolean>} Success indicator
     * @abstract
     */
    async updateIntegrationMessages(
        integrationId,
        messageType,
        messageTitle,
        messageBody,
        messageTimestamp
    ) {
        throw new Error('Method updateIntegrationMessages must be implemented by subclass');
    }

    /**
     * Create a new integration
     *
     * @param {Array<string|number>} entities - Array of entity IDs
     * @param {string|number} userId - User ID
     * @param {Object} config - Integration configuration
     * @returns {Promise<Object>} Created integration object
     * @abstract
     */
    async createIntegration(entities, userId, config) {
        throw new Error('Method createIntegration must be implemented by subclass');
    }

    /**
     * Find integration by user ID (returns single integration)
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Object|null>} Integration object or null
     * @abstract
     */
    async findIntegrationByUserId(userId) {
        throw new Error('Method findIntegrationByUserId must be implemented by subclass');
    }
}

module.exports = { IntegrationRepositoryInterface };
