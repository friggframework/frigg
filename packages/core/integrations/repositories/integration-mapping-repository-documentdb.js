const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
    deleteMany,
    aggregate,
    aggregateDrained,
} = require('../../database/documentdb-utils');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const {
    assertMappingWrittenUnencrypted,
} = require('../../database/encryption/integration-mapping-encryption');
const { validateMappingQuery } = require('./integration-mapping-query');
const {
    buildMappingQueryStages,
} = require('./integration-mapping-query-pipeline');

function storedIntegrationId(id) {
    if (!['string', 'number'].includes(typeof id) || id === '') {
        throw new TypeError(`Invalid ID: ${id}`);
    }
    return String(id);
}

class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    /**
     * integrationId is stored as a string in DocumentDB, so ids are matched as
     * strings (an ObjectId $in would never match). Drains the grouped cursor so
     * a deployment-wide count is not truncated at the first batch.
     */
    async countByIntegrationIds(ids = []) {
        const counts = new Map();
        if (!ids || ids.length === 0) return counts;

        const stringIds = ids.map(String);
        const rows = await aggregateDrained(this.prisma, 'IntegrationMapping', [
            { $match: { integrationId: { $in: stringIds } } },
            { $group: { _id: '$integrationId', count: { $sum: 1 } } },
        ]);

        for (const row of rows) {
            counts.set(String(row?._id), row?.count ?? 0);
        }
        return counts;
    }

    async findMappingBy(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const doc = await findOne(this.prisma, 'IntegrationMapping', filter);
        if (!doc) return null;

        const decryptedMapping = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            doc
        );
        return this._mapMapping(decryptedMapping);
    }

    async upsertMapping(integrationId, sourceId, mapping) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const existing = await findOne(
            this.prisma,
            'IntegrationMapping',
            filter
        );
        const now = new Date();

        if (existing) {
            const decryptedExisting =
                await this.encryptionService.decryptFields(
                    'IntegrationMapping',
                    existing
                );

            const updateDocument = {
                mapping,
                updatedAt: now,
            };

            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: updateDocument.mapping }
            );

            await updateOne(
                this.prisma,
                'IntegrationMapping',
                { _id: existing._id },
                {
                    $set: {
                        mapping: encryptedUpdate.mapping,
                        updatedAt: updateDocument.updatedAt,
                    },
                }
            );

            const updated = await findOne(this.prisma, 'IntegrationMapping', {
                _id: existing._id,
            });
            if (!updated) {
                console.error(
                    '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
                    {
                        mappingId: fromObjectId(existing._id),
                        integrationId,
                        sourceId,
                    }
                );
                throw new Error(
                    'Failed to update mapping: Document not found after update. ' +
                        'This indicates a database consistency issue.'
                );
            }
            const decryptedMapping = await this.encryptionService.decryptFields(
                'IntegrationMapping',
                updated
            );
            return this._mapMapping(decryptedMapping);
        }

        const plainDocument = {
            integrationId: integrationId,
            sourceId:
                sourceId === null || sourceId === undefined
                    ? null
                    : String(sourceId),
            mapping,
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields(
            'IntegrationMapping',
            plainDocument
        );

        const insertedId = await insertOne(
            this.prisma,
            'IntegrationMapping',
            encryptedDocument
        );

        const created = await findOne(this.prisma, 'IntegrationMapping', {
            _id: insertedId,
        });
        if (!created) {
            console.error(
                '[IntegrationMappingRepositoryDocumentDB] Mapping not found after insert',
                {
                    insertedId: fromObjectId(insertedId),
                    integrationId,
                    sourceId,
                }
            );
            throw new Error(
                'Failed to create mapping: Document not found after insert. ' +
                    'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            created
        );
        return this._mapMapping(decryptedMapping);
    }

    async findMappingsByIntegration(integrationId) {
        const filter = {};
        if (integrationId) filter.integrationId = integrationId;
        const docs = await findMany(this.prisma, 'IntegrationMapping', filter);

        const decryptedDocs = await Promise.all(
            docs.map((doc) =>
                this.encryptionService.decryptFields('IntegrationMapping', doc)
            )
        );

        return decryptedDocs.map((doc) => this._mapMapping(doc));
    }

    /**
     * @param {string} integrationId
     * @param {Object} query - See IntegrationMappingRepositoryInterface.queryMappings
     * @returns {Promise<{mappings: Array<Object>, total: number}>}
     */
    async queryMappings(integrationId, query) {
        const validated = validateMappingQuery(query);
        const stored = storedIntegrationId(integrationId);
        assertMappingWrittenUnencrypted();
        const { match, page, sort } = buildMappingQueryStages(
            stored,
            validated
        );

        const [docs, counts] = await Promise.all([
            aggregateDrained(
                this.prisma,
                'IntegrationMapping',
                [match, ...page, sort],
                { allowDiskUse: true }
            ),
            aggregate(this.prisma, 'IntegrationMapping', [
                match,
                { $count: 'total' },
            ]),
        ]);
        const decryptedDocs = await Promise.all(
            docs.map((doc) =>
                this.encryptionService.decryptFields('IntegrationMapping', doc)
            )
        );

        return {
            mappings: decryptedDocs.map((doc) => this._mapMapping(doc)),
            total: counts[0]?.total ?? 0,
        };
    }

    async deleteMapping(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const result = await deleteOne(
            this.prisma,
            'IntegrationMapping',
            filter
        );
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteMappingsByIntegration(integrationId) {
        if (!integrationId) {
            return { acknowledged: true, deletedCount: 0 };
        }
        const result = await deleteMany(this.prisma, 'IntegrationMapping', {
            integrationId: integrationId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findMappingById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'IntegrationMapping', {
            _id: objectId,
        });
        if (!doc) return null;

        const decryptedMapping = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            doc
        );
        return this._mapMapping(decryptedMapping);
    }

    async updateMapping(id, updates) {
        const objectId = toObjectId(id);
        if (!objectId) return null;

        const existing = await findOne(this.prisma, 'IntegrationMapping', {
            _id: objectId,
        });
        if (!existing) return null;

        const decryptedExisting = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            existing
        );

        const mergedMapping =
            updates.mapping !== undefined
                ? updates.mapping
                : decryptedExisting.mapping;

        const updateDocument = {
            ...updates,
            updatedAt: new Date(),
        };

        if (mergedMapping !== undefined) {
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: mergedMapping }
            );
            updateDocument.mapping = encryptedUpdate.mapping;
        }

        await updateOne(
            this.prisma,
            'IntegrationMapping',
            { _id: objectId },
            {
                $set: updateDocument,
            }
        );

        const updated = await findOne(this.prisma, 'IntegrationMapping', {
            _id: objectId,
        });
        if (!updated) {
            console.error(
                '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
                {
                    mappingId: fromObjectId(objectId),
                }
            );
            throw new Error(
                'Failed to update mapping: Document not found after update. ' +
                    'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            updated
        );
        return this._mapMapping(decryptedMapping);
    }

    _compositeFilter(integrationId, sourceId) {
        const filter = {};
        if (integrationId) filter.integrationId = integrationId;
        if (sourceId !== undefined) {
            filter.sourceId = sourceId === null ? null : String(sourceId);
        }
        return filter;
    }

    _mapMapping(doc) {
        return {
            id: fromObjectId(doc?._id),
            integrationId: doc?.integrationId ?? null,
            sourceId: doc?.sourceId ?? null,
            mapping: doc?.mapping ?? null,
            createdAt: doc?.createdAt,
            updatedAt: doc?.updatedAt,
        };
    }
}

module.exports = { IntegrationMappingRepositoryDocumentDB };
