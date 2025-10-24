/**
 * Health Check Repository Interface
 * Abstract base class defining the contract for health check persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, HealthCheckRepository has identical structure across MongoDB and PostgreSQL,
 * so HealthCheckRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class HealthCheckRepositoryInterface {
    /**
     * Ping database to verify connectivity
     *
     * @param {number} maxTimeMS - Maximum time in milliseconds
     * @returns {Promise<number>} Response time in milliseconds
     * @abstract
     */
    async pingDatabase(maxTimeMS) {
        throw new Error('Method pingDatabase must be implemented by subclass');
    }

    /**
     * Save a test document
     *
     * @param {Object} TestModel - Prisma model
     * @param {Object} data - Data to save
     * @returns {Promise<Object>} Saved document
     * @abstract
     */
    async saveTestDocument(TestModel, data) {
        throw new Error('Method saveTestDocument must be implemented by subclass');
    }

    /**
     * Find test document by ID
     *
     * @param {Object} TestModel - Prisma model
     * @param {string|number} id - Document ID
     * @returns {Promise<Object|null>} Document or null
     * @abstract
     */
    async findTestDocumentById(TestModel, id) {
        throw new Error('Method findTestDocumentById must be implemented by subclass');
    }

    /**
     * Get raw document from collection
     *
     * @param {string} collectionName - Collection name
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} Raw document or null
     * @abstract
     */
    async getRawDocumentFromCollection(collectionName, filter) {
        throw new Error('Method getRawDocumentFromCollection must be implemented by subclass');
    }

    /**
     * Delete test document
     *
     * @param {Object} TestModel - Prisma model
     * @param {string|number} id - Document ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteTestDocument(TestModel, id) {
        throw new Error('Method deleteTestDocument must be implemented by subclass');
    }

    /**
     * Get database connection state
     *
     * @returns {Object} Connection state info
     */
    getDatabaseConnectionState() {
        throw new Error('Method getDatabaseConnectionState must be implemented by subclass');
    }
}

module.exports = { HealthCheckRepositoryInterface };
