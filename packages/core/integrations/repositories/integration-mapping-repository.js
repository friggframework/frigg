const { prisma } = require('../../database/prisma');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');

/**
 * Prisma-based Integration Mapping Repository
 * Handles persistence of integration mappings used for data transformation
 *
 * Works identically for both MongoDB and PostgreSQL:
 * - MongoDB: String IDs with @db.ObjectId
 * - PostgreSQL: Integer IDs with auto-increment
 * - Both use same query patterns (no many-to-many differences)
 *
 * Migration from Mongoose:
 * - Constructor injection of Prisma client
 * - IntegrationMapping.findBy() → findFirst with where clause
 * - IntegrationMapping.upsert() → Prisma upsert with unique constraint
 * - mapping data stored in JSON field
 */
class IntegrationMappingRepository extends IntegrationMappingRepositoryInterface {
    constructor(prismaClient = prisma) {
        super();
        this.prisma = prismaClient; // Allow injection for testing
    }

    /**
     * Find mapping by integration ID and source ID
     * Replaces: IntegrationMapping.findBy(integrationId, sourceId)
     *
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object or null
     */
    async findMappingBy(integrationId, sourceId) {
        return await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId,
                sourceId,
            },
        });
    }

    /**
     * Create or update a mapping
     * Replaces: IntegrationMapping.upsert(integrationId, sourceId, mapping)
     *
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        return await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId,
                    sourceId,
                },
            },
            update: {
                mapping,
            },
            create: {
                integrationId,
                sourceId,
                mapping,
            },
        });
    }

    /**
     * Find all mappings for an integration
     * Replaces: IntegrationMapping.find({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID
     * @returns {Promise<Array>} Array of mapping documents
     */
    async findMappingsByIntegration(integrationId) {
        return await this.prisma.integrationMapping.findMany({
            where: { integrationId },
        });
    }

    /**
     * Delete a mapping by integration and source ID
     * Replaces: IntegrationMapping.deleteOne({ integration, sourceId })
     *
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMapping(integrationId, sourceId) {
        try {
            await this.prisma.integrationMapping.delete({
                where: {
                    integrationId_sourceId: {
                        integrationId,
                        sourceId,
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
     * @param {string} integrationId - The integration ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMappingsByIntegration(integrationId) {
        const result = await this.prisma.integrationMapping.deleteMany({
            where: { integrationId },
        });

        return {
            acknowledged: true,
            deletedCount: result.count,
        };
    }

    /**
     * Find mapping by ID
     * @param {string} id - Mapping ID
     * @returns {Promise<Object|null>} Mapping object or null
     */
    async findMappingById(id) {
        return await this.prisma.integrationMapping.findUnique({
            where: { id },
        });
    }

    /**
     * Update mapping by ID
     * @param {string} id - Mapping ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated mapping object
     */
    async updateMapping(id, updates) {
        return await this.prisma.integrationMapping.update({
            where: { id },
            data: updates,
        });
    }
}

module.exports = { IntegrationMappingRepository };
