/**
 * Token Repository Interface
 * Abstract base class defining the contract for token persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, Token model has identical structure across MongoDB and PostgreSQL,
 * so TokenRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class TokenRepositoryInterface {
    /**
     * Create token with expiration
     *
     * @param {string|number} userId - User ID
     * @param {string} rawToken - Raw unhashed token
     * @param {number} minutes - Minutes until expiration
     * @returns {Promise<Object>} Created token object
     * @abstract
     */
    async createTokenWithExpire(userId, rawToken, minutes) {
        throw new Error(
            'Method createTokenWithExpire must be implemented by subclass'
        );
    }

    /**
     * Validate and get token
     *
     * @param {Object} tokenObj - Token object with id and token
     * @returns {Promise<Object>} Validated token object
     * @abstract
     */
    async validateAndGetToken(tokenObj) {
        throw new Error(
            'Method validateAndGetToken must be implemented by subclass'
        );
    }

    /**
     * Find token by ID
     *
     * @param {string|number} tokenId - Token ID
     * @returns {Promise<Object|null>} Token object or null
     * @abstract
     */
    async findTokenById(tokenId) {
        throw new Error('Method findTokenById must be implemented by subclass');
    }

    /**
     * Find all tokens for a user
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<Array>} Array of token objects
     * @abstract
     */
    async findTokensByUserId(userId) {
        throw new Error(
            'Method findTokensByUserId must be implemented by subclass'
        );
    }

    /**
     * Delete token by ID
     *
     * @param {string|number} tokenId - Token ID
     * @returns {Promise<boolean>} True if deleted
     * @abstract
     */
    async deleteToken(tokenId) {
        throw new Error('Method deleteToken must be implemented by subclass');
    }

    /**
     * Delete expired tokens
     *
     * @returns {Promise<number>} Number of deleted tokens
     * @abstract
     */
    async deleteExpiredTokens() {
        throw new Error(
            'Method deleteExpiredTokens must be implemented by subclass'
        );
    }

    /**
     * Delete all tokens for a user
     *
     * @param {string|number} userId - User ID
     * @returns {Promise<number>} Number of deleted tokens
     * @abstract
     */
    async deleteTokensByUserId(userId) {
        throw new Error(
            'Method deleteTokensByUserId must be implemented by subclass'
        );
    }

    /**
     * Create base64 buffer token
     *
     * @param {Object} token - Token object
     * @param {string} rawToken - Raw token
     * @returns {string} Base64 encoded token
     */
    createBase64BufferToken(token, rawToken) {
        throw new Error(
            'Method createBase64BufferToken must be implemented by subclass'
        );
    }

    /**
     * Get JSON token from base64 buffer token
     *
     * @param {string} base64Token - Base64 encoded token
     * @returns {Object} Decoded token object
     */
    getJSONTokenFromBase64BufferToken(base64Token) {
        throw new Error(
            'Method getJSONTokenFromBase64BufferToken must be implemented by subclass'
        );
    }
}

module.exports = { TokenRepositoryInterface };
