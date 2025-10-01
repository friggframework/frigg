const { prisma } = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const { TokenRepositoryInterface } = require('./token-repository-interface');

const BCRYPT_ROUNDS = 10;

/**
 * MongoDB Token Repository Adapter
 * Handles persistence of authentication tokens with bcrypt hashing
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (ObjectId)
 * - No ID conversion needed (IDs are already strings)
 * - Bcrypt hashing handled in repository layer
 */
class TokenRepositoryMongo extends TokenRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Create a token with expiration
     * Replaces: Token.createTokenWithExpire(userId, rawToken, minutes)
     *
     * @param {string} userId - The user ID
     * @param {string} rawToken - The raw (unhashed) token string
     * @param {number} minutes - Minutes until expiration
     * @returns {Promise<Object>} The created token record with string IDs
     */
    async createTokenWithExpire(userId, rawToken, minutes) {
        // Hash the token with bcrypt
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

        // Calculate expiration time
        const expires = new Date(Date.now() + minutes * 60000);

        return await this.prisma.token.create({
            data: {
                token: tokenHash,
                expires,
                userId,
            },
        });
    }

    /**
     * Validate and retrieve token from JSON token object
     * Replaces: Token.validateAndGetTokenFromJSONToken(tokenObj)
     *
     * @param {Object} tokenObj - Object with id and token properties
     * @returns {Promise<Object>} The validated token record with string IDs
     * @throws {Error} If token is invalid, expired, or doesn't exist
     */
    async validateAndGetToken(tokenObj) {
        const sessionToken = await this.prisma.token.findUnique({
            where: { id: tokenObj.id },
        });

        if (!sessionToken) {
            throw new Error('Invalid Token: Token does not exist');
        }

        // Verify token hash matches
        const isValid = await bcrypt.compare(
            tokenObj.token,
            sessionToken.token
        );
        if (!isValid) {
            throw new Error('Invalid Token: Token does not match');
        }

        // Check if token is expired
        if (
            sessionToken.expires &&
            new Date(sessionToken.expires) < new Date()
        ) {
            throw new Error('Invalid Token: Token is expired');
        }

        return sessionToken;
    }

    /**
     * Find a token by ID
     * Replaces: Token.findById(tokenId)
     *
     * @param {string} tokenId - The token ID
     * @returns {Promise<Object|null>} The token record with string IDs or null
     */
    async findTokenById(tokenId) {
        return await this.prisma.token.findUnique({
            where: { id: tokenId },
        });
    }

    /**
     * Find tokens by user ID
     * Replaces: Token.find({ user: userId })
     *
     * @param {string} userId - The user ID
     * @returns {Promise<Array>} Array of token records with string IDs
     */
    async findTokensByUserId(userId) {
        return await this.prisma.token.findMany({
            where: { userId },
        });
    }

    /**
     * Delete a token by ID
     * Replaces: Token.deleteOne({ _id: tokenId })
     *
     * @param {string} tokenId - The token ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteToken(tokenId) {
        try {
            await this.prisma.token.delete({
                where: { id: tokenId },
            });
            return { acknowledged: true, deletedCount: 1 };
        } catch (error) {
            if (error.code === 'P2025') {
                // Record not found
                return { acknowledged: true, deletedCount: 0 };
            }
            throw error;
        }
    }

    /**
     * Delete expired tokens
     * Replaces: Token.deleteMany({ expires: { $lt: new Date() } })
     *
     * @returns {Promise<Object>} The deletion result with count
     */
    async deleteExpiredTokens() {
        const result = await this.prisma.token.deleteMany({
            where: {
                expires: {
                    lt: new Date(),
                },
            },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    /**
     * Delete all tokens for a user
     * Replaces: Token.deleteMany({ user: userId })
     *
     * @param {string} userId - The user ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteTokensByUserId(userId) {
        const result = await this.prisma.token.deleteMany({
            where: { userId },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    /**
     * Create JSON token string from token object and raw token
     * Replaces: Token.createJSONToken(token, rawToken)
     *
     * @param {Object} token - The token record
     * @param {string} rawToken - The raw token string
     * @returns {string} JSON string with id and token
     */
    createJSONToken(token, rawToken) {
        return JSON.stringify({
            id: token.id,
            token: rawToken,
        });
    }

    /**
     * Create base64 encoded buffer token
     * Replaces: Token.createBase64BufferToken(token, rawToken)
     *
     * @param {Object} token - The token record
     * @param {string} rawToken - The raw token string
     * @returns {string} Base64 encoded token
     */
    createBase64BufferToken(token, rawToken) {
        const jsonVal = this.createJSONToken(token, rawToken);
        return Buffer.from(jsonVal).toString('base64');
    }

    /**
     * Parse JSON token from base64 buffer
     * Replaces: Token.getJSONTokenFromBase64BufferToken(buffer)
     *
     * @param {string} buffer - Base64 encoded token string
     * @returns {Object} Parsed token object with id and token
     */
    getJSONTokenFromBase64BufferToken(buffer) {
        const tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    }
}

module.exports = { TokenRepositoryMongo };
