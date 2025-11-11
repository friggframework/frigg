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
} = require('../../database/documentdb-utils');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');

class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findMappingBy(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const doc = await findOne(this.prisma, 'IntegrationMapping', filter);
        return doc ? this._mapMapping(doc) : null;
    }

    async upsertMapping(integrationId, sourceId, mapping) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const existing = await findOne(this.prisma, 'IntegrationMapping', filter);
        const now = new Date();

        if (existing) {
            await updateOne(
                this.prisma,
                'IntegrationMapping',
                { _id: existing._id },
                {
                    $set: {
                        mapping,
                        updatedAt: now,
                    },
                }
            );
            const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: existing._id });
            return this._mapMapping(updated);
        }

        const document = {
            integrationId: toObjectId(integrationId),
            sourceId: sourceId === null || sourceId === undefined ? null : String(sourceId),
            mapping,
            createdAt: now,
            updatedAt: now,
        };
        const insertedId = await insertOne(this.prisma, 'IntegrationMapping', document);
        const created = await findOne(this.prisma, 'IntegrationMapping', { _id: insertedId });
        return this._mapMapping(created);
    }

    async findMappingsByIntegration(integrationId) {
        const filter = {};
        const integrationObjectId = toObjectId(integrationId);
        if (integrationObjectId) filter.integrationId = integrationObjectId;
        const docs = await findMany(this.prisma, 'IntegrationMapping', filter);
        return docs.map((doc) => this._mapMapping(doc));
    }

    async deleteMapping(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const result = await deleteOne(this.prisma, 'IntegrationMapping', filter);
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteMappingsByIntegration(integrationId) {
        const integrationObjectId = toObjectId(integrationId);
        if (!integrationObjectId) {
            return { acknowledged: true, deletedCount: 0 };
        }
        const result = await deleteMany(this.prisma, 'IntegrationMapping', {
            integrationId: integrationObjectId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findMappingById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        return doc ? this._mapMapping(doc) : null;
    }

    async updateMapping(id, updates) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        await updateOne(
            this.prisma,
            'IntegrationMapping',
            { _id: objectId },
            {
                $set: {
                    ...updates,
                    updatedAt: new Date(),
                },
            }
        );
        const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        return updated ? this._mapMapping(updated) : null;
    }

    _compositeFilter(integrationId, sourceId) {
        const filter = {};
        const integrationObjectId = toObjectId(integrationId);
        if (integrationObjectId) filter.integrationId = integrationObjectId;
        if (sourceId !== undefined) {
            filter.sourceId = sourceId === null ? null : String(sourceId);
        }
        return filter;
    }

    _mapMapping(doc) {
        return {
            id: fromObjectId(doc?._id),
            integrationId: fromObjectId(doc?.integrationId),
            sourceId: doc?.sourceId ?? null,
            mapping: doc?.mapping ?? null,
        };
    }
}

module.exports = { IntegrationMappingRepositoryDocumentDB };

