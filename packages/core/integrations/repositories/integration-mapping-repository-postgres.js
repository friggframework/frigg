const { prisma } = require('../../database/prisma');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');

/**
 * PostgreSQL Integration Mapping Repository Adapter
 * Handles persistence of integration mappings used for data transformation
 *
 * PostgreSQL-specific characteristics:
 * - Uses Int IDs with autoincrement
 * - Requires ID conversion: String (app layer) ↔ Int (database)
 * - All returned IDs are converted to strings for application layer consistency
 */
class IntegrationMappingRepositoryPostgres extends IntegrationMappingRepositoryInterface {
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
    _stringToInt(id) {
        if (id === null || id === undefined) return id;
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    /**
     * Convert any value to string (handles null/undefined)
     * @private
     * @param {*} value - Value to convert
     * @returns {string|null|undefined} String value or null/undefined
     */
    _toString(value) {
        if (value === null || value === undefined) return value;
        return String(value);
    }

    /**
     * Convert integer to string for application layer
     * @private
     * @param {number|null|undefined} id - Integer ID from database
     * @returns {string|null|undefined} String ID or null/undefined
     */
    _intToString(id) {
        if (id === null || id === undefined) return id;
        return id.toString();
    }

    /**
     * Legacy alias for _stringToInt (for backward compatibility)
     * @private
     */
    _convertId(id) {
        return this._stringToInt(id);
    }

    /**
     * Convert mapping object IDs to strings
     * @private
     * @param {Object|null} mapping - Mapping object from database
     * @returns {Object|null} Mapping with string IDs
     */
    _convertMappingIds(mapping) {
        if (!mapping) return mapping;
        return {
            ...mapping,
            id: this._intToString(mapping.id),
            integrationId: this._intToString(mapping.integrationId),
        };
    }

    /**
     * Find mapping by integration ID and source ID
     * Replaces: IntegrationMapping.findBy(integrationId, sourceId)
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object with string IDs or null
     */
    async findMappingBy(integrationId, sourceId) {
        const mapping = await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
            },
        });
        return this._convertMappingIds(mapping);
    }

    /**
     * Create or update a mapping
     * Replaces: IntegrationMapping.upsert(integrationId, sourceId, mapping)
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document with string IDs
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        const result = await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId: this._stringToInt(integrationId),
                    sourceId: this._toString(sourceId),
                },
            },
            update: {
                mapping,
            },
            create: {
                integrationId: this._stringToInt(integrationId),
                sourceId: this._toString(sourceId),
                mapping,
            },
        });
        return this._convertMappingIds(result);
    }

    /**
     * Find all mappings for an integration
     * Replaces: IntegrationMapping.find({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @returns {Promise<Array>} Array of mapping documents with string IDs
     */
    async findMappingsByIntegration(integrationId) {
        const intIntegrationId = this._convertId(integrationId);
        const mappings = await this.prisma.integrationMapping.findMany({
            where: { integrationId: intIntegrationId },
        });
        return mappings.map((m) => this._convertMappingIds(m));
    }

    /**
     * Delete a mapping by integration and source ID
     * Replaces: IntegrationMapping.deleteOne({ integration, sourceId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMapping(integrationId, sourceId) {
        try {
            await this.prisma.integrationMapping.delete({
                where: {
                    integrationId_sourceId: {
                        integrationId: this._stringToInt(integrationId),
                        sourceId: this._toString(sourceId),
                    },
                },
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
     * Delete all mappings for an integration
     * Replaces: IntegrationMapping.deleteMany({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID (string from application layer)
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMappingsByIntegration(integrationId) {
        const intIntegrationId = this._convertId(integrationId);
        const result = await this.prisma.integrationMapping.deleteMany({
            where: { integrationId: intIntegrationId },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    /**
     * Find mapping by ID
     * @param {string} id - Mapping ID (string from application layer)
     * @returns {Promise<Object|null>} Mapping object with string IDs or null
     */
    async findMappingById(id) {
        const intId = this._convertId(id);
        const mapping = await this.prisma.integrationMapping.findUnique({
            where: { id: intId },
        });
        return this._convertMappingIds(mapping);
    }

    /**
     * Update mapping by ID
     * @param {string} id - Mapping ID (string from application layer)
     * @param {Object} updates - Fields to update (with string IDs from application layer)
     * @returns {Promise<Object>} Updated mapping object with string IDs
     */
    async updateMapping(id, updates) {
        const intId = this._convertId(id);

        // Convert integrationId if present in updates
        const data = { ...updates };
        if (data.integrationId !== undefined) {
            data.integrationId = this._convertId(data.integrationId);
        }

        const mapping = await this.prisma.integrationMapping.update({
            where: { id: intId },
            data,
        });
        return this._convertMappingIds(mapping);
    }
}

module.exports = { IntegrationMappingRepositoryPostgres };
