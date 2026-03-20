import { SyncRepositoryInterface } from './sync-repository-interface';
import type { SyncData, SyncDataIdentifier, SyncFilter } from './sync-repository-interface';

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

export class SyncRepositoryDocumentDB extends SyncRepositoryInterface {
    private prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async getSyncObject(name: string, dataIdentifier: unknown, entity: string | number): Promise<SyncData | null> {
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
            return this._mapSync(syncList[0]);
        } else if (syncList.length === 0) {
            return null;
        }
        throw new Error(
            `There are multiple sync objects with the name ${name}, for entities [${syncList[0]?.entities}] [${syncList[1]?.entities}]`
        );
    }

    async upsertSync(filter: SyncFilter, syncData: Record<string, unknown>): Promise<SyncData> {
        const query = this._convertFilter(filter);
        const existing = await findOne(this.prisma, 'Sync', query);

        const now = new Date();
        const documentData = this._prepareSyncData(now, syncData);

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
            return this._mapSync(updated) as SyncData;
        }

        const insertedId = await insertOne(this.prisma, 'Sync', {
            ...documentData,
            createdAt: now,
        });
        const created = await findOne(this.prisma, 'Sync', { _id: insertedId });
        return this._mapSync(created) as SyncData;
    }

    async updateSync(id: string | number, updates: Record<string, unknown>): Promise<SyncData | null> {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const documentData = this._prepareSyncData(new Date(), updates);
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

    async addDataIdentifier(syncId: string | number, dataIdentifier: SyncDataIdentifier): Promise<SyncData | null> {
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

    getEntityObjIdForEntityIdFromObject(syncObj: SyncData, entityId: string | number): unknown {
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

    async findSyncs(filter: SyncFilter): Promise<SyncData[]> {
        const query = this._convertFilter(filter);
        const docs = await findMany(this.prisma, 'Sync', query);
        return docs.map((doc: any) => this._mapSync(doc) as SyncData);
    }

    async findOneSync(filter: SyncFilter): Promise<SyncData | null> {
        const query = this._convertFilter(filter);
        const doc = await findOne(this.prisma, 'Sync', query);
        return doc ? this._mapSync(doc) : null;
    }

    async deleteSync(id: string | number): Promise<unknown> {
        const objectId = toObjectId(id);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Sync', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    private _convertFilter(filter: SyncFilter = {} as SyncFilter): Record<string, unknown> {
        const query: Record<string, unknown> = { ...filter };
        if (filter._id || filter.id) {
            const idObj = toObjectId(filter._id || filter.id);
            if (idObj) query._id = idObj;
            delete query._id;
            delete query.id;
        }
        if (filter.integrationId) {
            query.integrationId = toObjectId(filter.integrationId);
        }
        if ((filter as any).entities) {
            query.entityIds = ((filter as any).entities || []).map((id: string) => toObjectId(id)).filter(Boolean);
            delete query.entities;
        }
        return query;
    }

    private _prepareSyncData(timestamp: Date, data: Record<string, unknown> = {}): Record<string, unknown> {
        const prepared: Record<string, unknown> = {};
        if (data.integrationId !== undefined) {
            prepared.integrationId = toObjectId(data.integrationId);
        }
        if (data.entities !== undefined || data.entityIds !== undefined) {
            const list = data.entities !== undefined ? data.entities : data.entityIds;
            prepared.entityIds = ((list as any[]) || []).map((id: string) => toObjectId(id)).filter(Boolean);
        }
        if (data.hash !== undefined) prepared.hash = data.hash;
        if (data.name !== undefined) prepared.name = data.name;
        if (data.context !== undefined) prepared.context = data.context;
        if (data.results !== undefined) prepared.results = data.results;
        if (timestamp) prepared.updatedAt = timestamp;
        if (data.dataIdentifiers !== undefined) {
            prepared.dataIdentifiers = ((data.dataIdentifiers as any[]) || []).map((identifier: any) => ({
                syncId: toObjectId(identifier.syncId),
                entityId: toObjectId(identifier.entityId),
                idData: identifier.idData,
                hash: identifier.hash,
                createdAt: identifier.createdAt ? new Date(identifier.createdAt) : new Date(),
            }));
        }
        return prepared;
    }

    private _mapSync(doc: any): SyncData | null {
        if (!doc) return null;
        return {
            id: fromObjectId(doc._id),
            integrationId: doc.integrationId ? fromObjectId(doc.integrationId) : null,
            entities: Array.isArray(doc.entityIds)
                ? doc.entityIds.map((id: any) => fromObjectId(id))
                : [],
            entityIds: Array.isArray(doc.entityIds)
                ? doc.entityIds.map((id: any) => fromObjectId(id))
                : [],
            hash: doc.hash ?? null,
            name: doc.name ?? null,
            dataIdentifiers: Array.isArray(doc.dataIdentifiers)
                ? doc.dataIdentifiers.map((identifier: any) => ({
                      syncId: identifier.syncId ? fromObjectId(identifier.syncId) : null,
                      entityId: identifier.entityId ? fromObjectId(identifier.entityId) : null,
                      idData: identifier.idData,
                      hash: identifier.hash,
                  }))
                : [],
        };
    }
}
