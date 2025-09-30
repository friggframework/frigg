const { Token } = require('./models/Token');

/**
 * Repository for Token operations.
 * Handles persistence of authentication tokens.
 */
class TokenRepository {
    /**
     * Create a token with expiration
     * @param {string} userId - The user ID
     * @param {string} rawToken - The raw (unhashed) token string
     * @param {number} minutes - Minutes until expiration
     * @returns {Promise<Object>} The created token record
     */
    async createTokenWithExpire(userId, rawToken, minutes) {
        return await Token.createTokenWithExpire(userId, rawToken, minutes);
    }

    /**
     * Validate and retrieve token from JSON token object
     * @param {Object} tokenObj - Object with id and token properties
     * @returns {Promise<Object>} The validated token record
     * @throws {Error} If token is invalid, expired, or doesn't exist
     */
    async validateAndGetToken(tokenObj) {
        return await Token.validateAndGetTokenFromJSONToken(tokenObj);
    }

    /**
     * Find a token by ID
     * @param {string} tokenId - The token ID
     * @returns {Promise<Object|null>} The token record or null
     */
    async findTokenById(tokenId) {
        return await Token.findById(tokenId);
    }

    /**
     * Find tokens by user ID
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} Array of token records
     */
    async findTokensByUserId(userId) {
        return await Token.find({ user: userId });
    }

    /**
     * Delete a token by ID
     * @param {string} tokenId - The token ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteToken(tokenId) {
        return await Token.deleteOne({ _id: tokenId });
    }

    /**
     * Delete expired tokens
     * @returns {Promise<Object>} The deletion result with count
     */
    async deleteExpiredTokens() {
        return await Token.deleteMany({
            expires: { $lt: new Date() },
        });
    }

    /**
     * Delete all tokens for a user
     * @param {string} userId - The user ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteTokensByUserId(userId) {
        return await Token.deleteMany({ user: userId });
    }

    /**
     * Create JSON token string from token object and raw token
     * @param {Object} token - The token record
     * @param {string} rawToken - The raw token string
     * @returns {string} JSON string with id and token
     */
    createJSONToken(token, rawToken) {
        return Token.createJSONToken(token, rawToken);
    }

    /**
     * Create base64 encoded buffer token
     * @param {Object} token - The token record
     * @param {string} rawToken - The raw token string
     * @returns {string} Base64 encoded token
     */
    createBase64BufferToken(token, rawToken) {
        return Token.createBase64BufferToken(token, rawToken);
    }

    /**
     * Parse JSON token from base64 buffer
     * @param {string} buffer - Base64 encoded token string
     * @returns {Object} Parsed token object with id and token
     */
    getJSONTokenFromBase64BufferToken(buffer) {
        return Token.getJSONTokenFromBase64BufferToken(buffer);
    }
}

module.exports = { TokenRepository };