const { prisma } = require('../../database/prisma');
const bcrypt = require('bcryptjs');
const { TokenRepositoryInterface } = require('./token-repository-interface');

const BCRYPT_ROUNDS = 10;

/**
 * PostgreSQL Token Repository Adapter
 * Handles persistence of authentication tokens with bcrypt hashing
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class TokenRepositoryPostgres extends TokenRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert token object IDs to strings
     * @private
     * @param {Object|null} token - Token object from database
     * @returns {Object|null} Token with string IDs
     */
    _convertTokenIds(token) {
        if (!token) return token;
        return {
            ...token,
            id: token.id?.toString(),
            userId: token.userId?.toString(),
        };
    }

    /**
     * Create a token with expiration
     * Replaces: Token.createTokenWithExpire(userId, rawToken, minutes)
     *
     * @param {string} userId - The user ID (string from application layer)
     * @param {string} rawToken - The raw (unhashed) token string
     * @param {number} minutes - Minutes until expiration
     * @returns {Promise<Object>} The created token record with string IDs
     */
    async createTokenWithExpire(userId, rawToken, minutes) {
        // Hash the token with bcrypt
        const tokenHash = await bcrypt.hash(rawToken, BCRYPT_ROUNDS);

        // Calculate expiration time
        const expires = new Date(Date.now() + minutes * 60000);

        const token = await this.prisma.token.create({
            data: {
                token: tokenHash,
                expires,
                userId: this._convertId(userId),
            },
        });

        return this._convertTokenIds(token);
    }

    /**
     * Validate and retrieve token from JSON token object
     * Replaces: Token.validateAndGetTokenFromJSONToken(tokenObj)
     *
     * @param {Object} tokenObj - Object with id and token properties (id as string from app layer)
     * @returns {Promise<Object>} The validated token record with string IDs
     * @throws {Error} If token is invalid, expired, or doesn't exist
     */
    async validateAndGetToken(tokenObj) {
        const intId = this._convertId(tokenObj.id);
        const sessionToken = await this.prisma.token.findUnique({
            where: { id: intId },
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

        return this._convertTokenIds(sessionToken);
    }

    /**
     * Find a token by ID
     * Replaces: Token.findById(tokenId)
     *
     * @param {string} tokenId - The token ID (string from application layer)
     * @returns {Promise<Object|null>} The token record with string IDs or null
     */
    async findTokenById(tokenId) {
        const intId = this._convertId(tokenId);
        const token = await this.prisma.token.findUnique({
            where: { id: intId },
        });
        return this._convertTokenIds(token);
    }

    /**
     * Find tokens by user ID
     * Replaces: Token.find({ user: userId })
     *
     * @param {string} userId - The user ID (string from application layer)
     * @returns {Promise<Array>} Array of token records with string IDs
     */
    async findTokensByUserId(userId) {
        const intUserId = this._convertId(userId);
        const tokens = await this.prisma.token.findMany({
            where: { userId: intUserId },
        });
        return tokens.map((token) => this._convertTokenIds(token));
    }

    /**
     * Delete a token by ID
     * Replaces: Token.deleteOne({ _id: tokenId })
     *
     * @param {string} tokenId - The token ID (string from application layer)
     * @returns {Promise<Object>} The deletion result
     */
    async deleteToken(tokenId) {
        try {
            const intId = this._convertId(tokenId);
            await this.prisma.token.delete({
                where: { id: intId },
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
     * @param {string} userId - The user ID (string from application layer)
     * @returns {Promise<Object>} The deletion result
     */
    async deleteTokensByUserId(userId) {
        const intUserId = this._convertId(userId);
        const result = await this.prisma.token.deleteMany({
            where: { userId: intUserId },
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
     * Note: Token ID is already a string at this point (from _convertTokenIds),
     * so no conversion needed here.
     *
     * @param {Object} token - The token record (with string IDs)
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
     * @param {Object} token - The token record (with string IDs)
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
     * Note: Parsed token ID will be a string, which is correct for application layer
     *
     * @param {string} buffer - Base64 encoded token string
     * @returns {Object} Parsed token object with id and token (id as string)
     */
    getJSONTokenFromBase64BufferToken(buffer) {
        const tokenStr = Buffer.from(buffer.trim(), 'base64').toString('ascii');
        return JSON.parse(tokenStr);
    }
}

module.exports = { TokenRepositoryPostgres };
