const { prisma } = require('../../database/prisma');
const {
    AdminApiKeyRepositoryInterface,
} = require('./admin-api-key-repository-interface');

/**
 * MongoDB Admin API Key Repository Adapter
 * Handles admin API key persistence using Prisma with MongoDB
 *
 * MongoDB-specific characteristics:
 * - IDs are strings with @db.ObjectId
 * - Supports bcrypt hashed keys
 * - Scopes stored as String[] array
 */
class AdminApiKeyRepositoryMongo extends AdminApiKeyRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Create a new admin API key
     *
     * @param {Object} params - API key creation parameters
     * @param {string} params.name - Human-readable name for the key
     * @param {string} params.keyHash - bcrypt hash of the raw key
     * @param {string} params.keyLast4 - Last 4 characters of key (for display)
     * @param {string[]} params.scopes - Array of permission scopes
     * @param {Date} [params.expiresAt] - Optional expiration date
     * @param {string} [params.createdBy] - Optional identifier of creator
     * @returns {Promise<Object>} The created API key record
     */
    async createApiKey({ name, keyHash, keyLast4, scopes, expiresAt, createdBy }) {
        const apiKey = await this.prisma.adminApiKey.create({
            data: {
                name,
                keyHash,
                keyLast4,
                scopes,
                expiresAt,
                createdBy,
            },
        });

        return apiKey;
    }

    /**
     * Find an API key by its bcrypt hash
     * Used during authentication to validate incoming keys
     *
     * @param {string} keyHash - The bcrypt hash to search for
     * @returns {Promise<Object|null>} The API key record or null if not found
     */
    async findApiKeyByHash(keyHash) {
        const apiKey = await this.prisma.adminApiKey.findUnique({
            where: { keyHash },
        });

        return apiKey;
    }

    /**
     * Find an API key by its ID
     *
     * @param {string} id - The API key ID (MongoDB ObjectId as string)
     * @returns {Promise<Object|null>} The API key record or null if not found
     */
    async findApiKeyById(id) {
        const apiKey = await this.prisma.adminApiKey.findUnique({
            where: { id },
        });

        return apiKey;
    }

    /**
     * Find all active (non-expired, non-deactivated) API keys
     * Used during authentication to check all valid keys
     *
     * @returns {Promise<Array>} Array of active API key records
     */
    async findActiveApiKeys() {
        const now = new Date();
        const apiKeys = await this.prisma.adminApiKey.findMany({
            where: {
                isActive: true,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: now } },
                ],
            },
        });

        return apiKeys;
    }

    /**
     * Update the lastUsedAt timestamp for an API key
     * Called after successful authentication
     *
     * @param {string} id - The API key ID
     * @returns {Promise<Object>} Updated API key record
     */
    async updateApiKeyLastUsed(id) {
        const apiKey = await this.prisma.adminApiKey.update({
            where: { id },
            data: {
                lastUsedAt: new Date(),
            },
        });

        return apiKey;
    }

    /**
     * Deactivate an API key (soft delete)
     * Sets isActive to false, preventing further use
     *
     * @param {string} id - The API key ID
     * @returns {Promise<Object>} Updated API key record
     */
    async deactivateApiKey(id) {
        const apiKey = await this.prisma.adminApiKey.update({
            where: { id },
            data: {
                isActive: false,
            },
        });

        return apiKey;
    }

    /**
     * Delete an API key (hard delete)
     * Permanently removes the key from the database
     *
     * @param {string} id - The API key ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteApiKey(id) {
        await this.prisma.adminApiKey.delete({
            where: { id },
        });

        // Return Mongoose-compatible result
        return { acknowledged: true, deletedCount: 1 };
    }
}

module.exports = { AdminApiKeyRepositoryMongo };
