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
     * @returns {Promise<{readyState: number, stateName: string, isConnected: boolean}>}
     * @abstract
     */
    async getDatabaseConnectionState() {
        throw new Error('Method getDatabaseConnectionState must be implemented by subclass');
    }

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
     * Persist an encrypted credential for health verification.
     * Implementations should rely on Prisma so encryption middleware runs.
     *
     * @param {Object} credentialData
     * @returns {Promise<Object>} Persisted credential
     * @abstract
     */
    async createCredential(credentialData) {
        throw new Error('Method createCredential must be implemented by subclass');
    }

    /**
     * Retrieve credential by ID using Prisma (decrypted).
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     * @abstract
     */
    async findCredentialById(id) {
        throw new Error('Method findCredentialById must be implemented by subclass');
    }

    /**
     * Fetch raw credential document from the database (without decryption).
     *
     * @param {string} id
     * @returns {Promise<Object|null>}
     * @abstract
     */
    async getRawCredentialById(id) {
        throw new Error('Method getRawCredentialById must be implemented by subclass');
    }

    /**
     * Delete credential by ID.
     *
     * @param {string} id
     * @returns {Promise<void>}
     * @abstract
     */
    async deleteCredential(id) {
        throw new Error('Method deleteCredential must be implemented by subclass');
    }
}

module.exports = { HealthCheckRepositoryInterface };
