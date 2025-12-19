const { prisma } = require('../../database/prisma');
const {
    AdminApiKeyRepositoryInterface,
} = require('./admin-api-key-repository-interface');

/**
 * PostgreSQL Admin API Key Repository Adapter
 * Handles admin API key persistence using Prisma with PostgreSQL
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class AdminApiKeyRepositoryPostgres extends AdminApiKeyRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
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
        const parsed = Number.parseInt(id, 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert API key object IDs to strings
     * @private
     * @param {Object|null} apiKey - API key object from database
     * @returns {Object|null} API key with string IDs
     */
    _convertApiKeyIds(apiKey) {
        if (!apiKey) return apiKey;
        return {
            ...apiKey,
            id: apiKey.id?.toString(),
        };
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
     * @returns {Promise<Object>} The created API key record with string ID
     */
    async createApiKey({
        name,
        keyHash,
        keyLast4,
        scopes,
        expiresAt,
        createdBy,
    }) {
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

        return this._convertApiKeyIds(apiKey);
    }

    /**
     * Find an API key by its bcrypt hash
     * Used during authentication to validate incoming keys
     *
     * @param {string} keyHash - The bcrypt hash to search for
     * @returns {Promise<Object|null>} The API key record with string ID or null if not found
     */
    async findApiKeyByHash(keyHash) {
        const apiKey = await this.prisma.adminApiKey.findUnique({
            where: { keyHash },
        });

        return this._convertApiKeyIds(apiKey);
    }

    /**
     * Find an API key by its ID
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object|null>} The API key record with string ID or null if not found
     */
    async findApiKeyById(id) {
        const intId = this._convertId(id);
        const apiKey = await this.prisma.adminApiKey.findUnique({
            where: { id: intId },
        });

        return this._convertApiKeyIds(apiKey);
    }

    /**
     * Find all active (non-expired, non-deactivated) API keys
     * Used during authentication to check all valid keys
     *
     * @returns {Promise<Array>} Array of active API key records with string IDs
     */
    async findActiveApiKeys() {
        const now = new Date();
        const apiKeys = await this.prisma.adminApiKey.findMany({
            where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
        });

        return apiKeys.map((apiKey) => this._convertApiKeyIds(apiKey));
    }

    /**
     * Update the lastUsedAt timestamp for an API key
     * Called after successful authentication
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Updated API key record with string ID
     */
    async updateApiKeyLastUsed(id) {
        const intId = this._convertId(id);
        const apiKey = await this.prisma.adminApiKey.update({
            where: { id: intId },
            data: {
                lastUsedAt: new Date(),
            },
        });

        return this._convertApiKeyIds(apiKey);
    }

    /**
     * Deactivate an API key (soft delete)
     * Sets isActive to false, preventing further use
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Updated API key record with string ID
     */
    async deactivateApiKey(id) {
        const intId = this._convertId(id);
        const apiKey = await this.prisma.adminApiKey.update({
            where: { id: intId },
            data: {
                isActive: false,
            },
        });

        return this._convertApiKeyIds(apiKey);
    }

    /**
     * Delete an API key (hard delete)
     * Permanently removes the key from the database
     *
     * @param {string|number} id - The API key ID
     * @returns {Promise<Object>} Deletion result
     */
    async deleteApiKey(id) {
        const intId = this._convertId(id);
        await this.prisma.adminApiKey.delete({
            where: { id: intId },
        });

        // Return Mongoose-compatible result
        return { acknowledged: true, deletedCount: 1 };
    }
}

module.exports = { AdminApiKeyRepositoryPostgres };
