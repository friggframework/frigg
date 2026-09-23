const { prisma } = require('../../database/prisma');
const {
    assertMappingWrittenUnencrypted,
} = require('../../database/encryption/integration-mapping-encryption');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const { validateMappingQuery } = require('./integration-mapping-query');
const {
    buildMappingQueryStages,
} = require('./integration-mapping-query-pipeline');

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const fromRawDate = (raw) => new Date(raw.$date);

function strictObjectId(id) {
    if (typeof id !== 'string' || !OBJECT_ID_REGEX.test(id)) {
        throw new TypeError(`Invalid ID: ${id} is not an ObjectId`);
    }
    return id;
}

/**
 * MongoDB Integration Mapping Repository Adapter
 * Handles persistence of integration mappings used for data transformation
 *
 * MongoDB-specific characteristics:
 * - Uses String IDs (ObjectId)
 * - No ID conversion needed (IDs are already strings)
 * - mapping data stored in JSON field
 */
class IntegrationMappingRepositoryMongo extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
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
     * Find mapping by integration ID and source ID
     * Replaces: IntegrationMapping.findBy(integrationId, sourceId)
     *
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object with string IDs or null
     */
    async findMappingBy(integrationId, sourceId) {
        return await this.prisma.integrationMapping.findFirst({
            where: {
                integrationId,
                sourceId: this._toString(sourceId),
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
     * @returns {Promise<Object>} The created or updated mapping document with string IDs
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        return await this.prisma.integrationMapping.upsert({
            where: {
                integrationId_sourceId: {
                    integrationId,
                    sourceId: this._toString(sourceId),
                },
            },
            update: {
                mapping,
            },
            create: {
                integrationId,
                sourceId: this._toString(sourceId),
                mapping,
            },
        });
    }

    /**
     * Find all mappings for an integration
     * Replaces: IntegrationMapping.find({ integration: integrationId })
     *
     * @param {string} integrationId - The integration ID
     * @returns {Promise<Array>} Array of mapping documents with string IDs
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
     * Count mappings grouped by integration id for a bounded id set.
     *
     * @param {Array<string>} ids - Integration ids
     * @returns {Promise<Map<string, number>>} integrationId (string) → count
     */
    async countByIntegrationIds(ids = []) {
        const counts = new Map();
        if (!ids || ids.length === 0) return counts;

        const groups = await this.prisma.integrationMapping.groupBy({
            by: ['integrationId'],
            where: { integrationId: { in: ids } },
            _count: { _all: true },
        });

        for (const group of groups) {
            counts.set(String(group.integrationId), group._count._all);
        }
        return counts;
    }

    /**
     * @param {string} integrationId
     * @param {Object} query - See IntegrationMappingRepositoryInterface.queryMappings
     * @returns {Promise<{mappings: Array<Object>, total: number}>}
     */
    async queryMappings(integrationId, query) {
        const validated = validateMappingQuery(query);
        const objectId = strictObjectId(integrationId);
        assertMappingWrittenUnencrypted();
        const { match, page } = buildMappingQueryStages(
            { $oid: objectId },
            validated
        );

        const result = await this.prisma.$runCommandRaw({
            aggregate: 'IntegrationMapping',
            pipeline: [
                match,
                {
                    $facet: {
                        mappings: page,
                        total: [{ $count: 'total' }],
                    },
                },
            ],
            cursor: {},
            allowDiskUse: true,
        });
        const [{ mappings, total }] = result.cursor.firstBatch;

        return {
            mappings: mappings.map((doc) => this._fromRawMapping(doc)),
            total: total[0]?.total ?? 0,
        };
    }

    /**
     * A raw aggregate document, in the shape findMappingsByIntegration returns.
     * @private
     */
    _fromRawMapping(doc) {
        return {
            id: doc._id.$oid,
            integrationId: doc.integrationId.$oid,
            sourceId: doc.sourceId ?? null,
            mapping: doc.mapping ?? null,
            createdAt: fromRawDate(doc.createdAt),
            updatedAt: fromRawDate(doc.updatedAt),
        };
    }

    /**
     * Find mapping by ID
     * @param {string} id - Mapping ID
     * @returns {Promise<Object|null>} Mapping object with string IDs or null
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
     * @returns {Promise<Object>} Updated mapping object with string IDs
     */
    async updateMapping(id, updates) {
        return await this.prisma.integrationMapping.update({
            where: { id },
            data: updates,
        });
    }
}

module.exports = { IntegrationMappingRepositoryMongo };
