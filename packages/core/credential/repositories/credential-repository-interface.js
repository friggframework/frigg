/**
 * Credential Repository Interface
 * Abstract base class defining the contract for credential persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, Credential model has identical structure across MongoDB and PostgreSQL,
 * so CredentialRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class CredentialRepositoryInterface {
    /**
     * Find credential by ID
     *
     * @param {string|number} id - Credential ID
     * @returns {Promise<Object|null>} Credential object or null
     * @abstract
     */
    async findCredentialById(id) {
        throw new Error(
            'Method findCredentialById must be implemented by subclass'
        );
    }

    /**
     * Update authentication status
     *
     * @param {string|number} credentialId - Credential ID
     * @param {boolean} authIsValid - Authentication validity status
     * @returns {Promise<Object>} Update result
     * @abstract
     */
    async updateAuthenticationStatus(credentialId, authIsValid) {
        throw new Error(
            'Method updateAuthenticationStatus must be implemented by subclass'
        );
    }

    /**
     * Permanently remove a credential document
     *
     * @param {string|number} credentialId - Credential ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteCredentialById(credentialId) {
        throw new Error(
            'Method deleteCredentialById must be implemented by subclass'
        );
    }

    /**
     * Create or update credential matching identifiers
     *
     * @param {{identifiers: Object, details: Object}} credentialDetails
     * @returns {Promise<Object>} The persisted credential
     * @abstract
     */
    async upsertCredential(credentialDetails) {
        throw new Error(
            'Method upsertCredential must be implemented by subclass'
        );
    }

    /**
     * Find a credential by filter criteria
     *
     * @param {Object} filter - Filter criteria
     * @returns {Promise<Object|null>} Credential object or null if not found
     * @abstract
     */
    async findCredential(filter) {
        throw new Error(
            'Method findCredential must be implemented by subclass'
        );
    }

    /**
     * Update a credential by ID
     *
     * @param {string|number} credentialId - Credential ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object|null>} Updated credential object or null if not found
     * @abstract
     */
    async updateCredential(credentialId, updates) {
        throw new Error(
            'Method updateCredential must be implemented by subclass'
        );
    }
}

module.exports = { CredentialRepositoryInterface };
