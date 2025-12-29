/**
 * Admin API Key Repository Interface
 * Abstract base class defining the contract for admin API key persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Admin API keys provide authentication for script execution and management endpoints.
 * Keys are bcrypt-hashed for security and support scoping and expiration.
 *
 * @abstract
 */
class AdminApiKeyRepositoryInterface {
    /**
     * Create a new admin API key
     *
     * @param {Object} params - API key creation parameters
     * @param {string} params.name - Human-readable name for the key
     * @param {string} params.keyHash - bcrypt hash of the raw key
     * @param {string} params.keyLast4 - Last 4 characters of key (for display)
     * @param {string[]} params.scopes - Array of permission scopes (e.g., ['scripts:execute', 'scripts:read'])
     * @param {Date} [params.expiresAt] - Optional expiration date
     * @param {string} [params.createdBy] - Optional identifier of creator (user/admin)
     * @returns {Promise<Object>} The created API key record
     * @abstract
     */
    async createApiKey({
        name,
        keyHash,
        keyLast4,
        scopes,
        expiresAt,
        createdBy,
    }) {
        throw new Error('Method createApiKey must be implemented by subclass');
    }

    /**
     * Find an API key by its bcrypt hash
     * Used during authentication to validate incoming keys
     *
     * @param {string} keyHash - The bcrypt hash to search for
     * @returns {Promise<Object|null>} The API key record or null if not found
     * @abstract
     */
    async findApiKeyByHash(keyHash) {
        throw new Error(
            'Method findApiKeyByHash must be implemented by subclass'
        );
    }

    /**
     * Find an API key by its ID
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object|null>} The API key record or null if not found
     * @abstract
     */
    async findApiKeyById(id) {
        throw new Error(
            'Method findApiKeyById must be implemented by subclass'
        );
    }

    /**
     * Find all active (non-expired, non-deactivated) API keys
     * Used during authentication to check all valid keys
     *
     * @returns {Promise<Array>} Array of active API key records
     * @abstract
     */
    async findActiveApiKeys() {
        throw new Error(
            'Method findActiveApiKeys must be implemented by subclass'
        );
    }

    /**
     * Update the lastUsedAt timestamp for an API key
     * Called after successful authentication
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Updated API key record
     * @abstract
     */
    async updateApiKeyLastUsed(id) {
        throw new Error(
            'Method updateApiKeyLastUsed must be implemented by subclass'
        );
    }

    /**
     * Deactivate an API key (soft delete)
     * Sets isActive to false, preventing further use
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Updated API key record
     * @abstract
     */
    async deactivateApiKey(id) {
        throw new Error(
            'Method deactivateApiKey must be implemented by subclass'
        );
    }

    /**
     * Delete an API key (hard delete)
     * Permanently removes the key from the database
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteApiKey(id) {
        throw new Error('Method deleteApiKey must be implemented by subclass');
    }
}

module.exports = { AdminApiKeyRepositoryInterface };
