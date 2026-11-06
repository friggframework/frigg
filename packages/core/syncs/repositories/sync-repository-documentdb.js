const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const { SyncRepositoryInterface } = require('./sync-repository-interface');

class SyncRepositoryDocumentDB extends SyncRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async getSyncObject(name, dataIdentifier, entity) {
        const pipeline = [
            {
                $match: {
                    name,
                    dataIdentifiers: {
                        $elemMatch: {
                            idData: dataIdentifier,
                            entityId: toObjectId(entity),
                        },
                    },
                },
            },
            {
                $limit: 2,
            },
        ];

        const result = await this.prisma.$runCommandRaw({
            aggregate: 'Sync',
            pipeline,
            cursor: {},
        });

        const syncList = result?.cursor?.firstBatch || [];

        if (syncList.length === 1) {
            const doc = syncList[0];
            return this._mapSync(doc);
        } else if (syncList.length === 0) {
            return null;
        }
        throw new Error(
            `There are multiple sync objects with the name ${name}, for entities [${syncList[0]?.entities}] [${syncList[1]?.entities}]`
        );
    }

    async upsertSync(filter, syncData) {
        const query = this._convertFilter(filter);
        const existing = await findOne(this.prisma, 'Sync', query);

        const now = new Date();
        const documentData = this._prepareSyncData(syncData, now);

        if (existing) {
            await updateOne(
                this.prisma,
                'Sync',
                { _id: existing._id },
                {
                    $set: documentData,
                }
            );
            const updated = await findOne(this.prisma, 'Sync', { _id: existing._id });
            return this._mapSync(updated);
        }

        const insertedId = await insertOne(this.prisma, 'Sync', {
            ...documentData,
            createdAt: now,
        });
        const created = await findOne(this.prisma, 'Sync', { _id: insertedId });
        return this._mapSync(created);
    }

    async updateSync(id, updates) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const documentData = this._prepareSyncData(updates, new Date());
        await updateOne(
            this.prisma,
            'Sync',
            { _id: objectId },
            {
                $set: documentData,
            }
        );
        const updated = await findOne(this.prisma, 'Sync', { _id: objectId });
        return updated ? this._mapSync(updated) : null;
    }

    async addDataIdentifier(syncId, dataIdentifier) {
        const syncObjectId = toObjectId(syncId);
        if (!syncObjectId) return null;
        const doc = await findOne(this.prisma, 'Sync', { _id: syncObjectId });
        if (!doc) return null;

        const identifiers = Array.isArray(doc.dataIdentifiers) ? [...doc.dataIdentifiers] : [];
        identifiers.push({
            syncId: syncObjectId,
            entityId: toObjectId(dataIdentifier.entity),
            idData: dataIdentifier.id,
            hash: dataIdentifier.hash,
            createdAt: new Date(),
        });

        await updateOne(
            this.prisma,
            'Sync',
            { _id: syncObjectId },
            {
                $set: {
                    dataIdentifiers: identifiers,
                    updatedAt: new Date(),
                },
            }
        );

        const updated = await findOne(this.prisma, 'Sync', { _id: syncObjectId });
        return updated ? this._mapSync(updated) : null;
    }

    getEntityObjIdForEntityIdFromObject(syncObj, entityId) {
        if (!syncObj || !Array.isArray(syncObj.dataIdentifiers)) {
            throw new Error('Sync object must include dataIdentifiers');
        }

        const entry = syncObj.dataIdentifiers.find(
            (identifier) => fromObjectId(identifier.entityId) === String(entityId)
        );

        if (entry) {
            return entry.idData;
        }

        throw new Error(
            `Sync object ${syncObj.id} does not contain a data identifier for entity ${entityId}`
        );
    }

    async findSyncs(filter) {
        const query = this._convertFilter(filter);
        const docs = await findMany(this.prisma, 'Sync', query);
        return docs.map((doc) => this._mapSync(doc));
    }

    async findOneSync(filter) {
        const query = this._convertFilter(filter);
        const doc = await findOne(this.prisma, 'Sync', query);
        return doc ? this._mapSync(doc) : null;
    }

    async deleteSync(id) {
        const objectId = toObjectId(id);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Sync', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    _convertFilter(filter = {}) {
        const query = { ...filter };
        if (filter._id || filter.id) {
            const idObj = toObjectId(filter._id || filter.id);
            if (idObj) query._id = idObj;
            delete query._id;
            delete query.id;
        }
        if (filter.integrationId) {
            query.integrationId = toObjectId(filter.integrationId);
        }
        if (filter.entities) {
            query.entityIds = (filter.entities || []).map((id) => toObjectId(id)).filter(Boolean);
            delete query.entities;
        }
        return query;
    }

    _prepareSyncData(data = {}, timestamp) {
        const prepared = {};
        if (data.integrationId !== undefined) {
            prepared.integrationId = toObjectId(data.integrationId);
        }
        if (data.entities !== undefined || data.entityIds !== undefined) {
            const list = data.entities !== undefined ? data.entities : data.entityIds;
            prepared.entityIds = (list || []).map((id) => toObjectId(id)).filter(Boolean);
        }
        if (data.hash !== undefined) prepared.hash = data.hash;
        if (data.name !== undefined) prepared.name = data.name;
        if (data.context !== undefined) prepared.context = data.context;
        if (data.results !== undefined) prepared.results = data.results;
        if (timestamp) prepared.updatedAt = timestamp;
        if (data.dataIdentifiers !== undefined) {
            prepared.dataIdentifiers = (data.dataIdentifiers || []).map((identifier) => ({
                syncId: toObjectId(identifier.syncId),
                entityId: toObjectId(identifier.entityId),
                idData: identifier.idData,
                hash: identifier.hash,
                createdAt: identifier.createdAt ? new Date(identifier.createdAt) : new Date(),
            }));
        }
        return prepared;
    }

    _mapSync(doc) {
        if (!doc) return null;
        return {
            id: fromObjectId(doc._id),
            integrationId: doc.integrationId ? fromObjectId(doc.integrationId) : null,
            entities: Array.isArray(doc.entityIds)
                ? doc.entityIds.map((id) => fromObjectId(id))
                : [],
            entityIds: Array.isArray(doc.entityIds)
                ? doc.entityIds.map((id) => fromObjectId(id))
                : [],
            hash: doc.hash ?? null,
            name: doc.name ?? null,
            dataIdentifiers: Array.isArray(doc.dataIdentifiers)
                ? doc.dataIdentifiers.map((identifier) => ({
                      syncId: identifier.syncId ? fromObjectId(identifier.syncId) : null,
                      entityId: identifier.entityId ? fromObjectId(identifier.entityId) : null,
                      idData: identifier.idData,
                      hash: identifier.hash,
                  }))
                : [],
        };
    }
}

module.exports = { SyncRepositoryDocumentDB };


