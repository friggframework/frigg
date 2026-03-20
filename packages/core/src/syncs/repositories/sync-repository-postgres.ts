import { SyncRepositoryInterface } from './sync-repository-interface';
import type { SyncData, SyncDataIdentifier, SyncFilter } from './sync-repository-interface';

const { prisma } = require('../../database/prisma');

export class SyncRepositoryPostgres extends SyncRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _convertId(id: string | number | null | undefined): number | null | undefined {
        if (id === null || id === undefined) return id;
        const parsed = Number.parseInt(String(id), 10);
        if (Number.isNaN(parsed)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parsed;
    }

    private _convertSyncIds(sync: any): SyncData | null {
        if (!sync) return sync;
        return {
            ...sync,
            id: sync.id?.toString(),
            integrationId: sync.integrationId?.toString(),
            entities: sync.entities?.map((e: any) => ({
                ...e,
                id: e.id?.toString(),
                userId: e.userId?.toString(),
                credentialId: e.credentialId?.toString(),
            })),
            dataIdentifiers: sync.dataIdentifiers?.map((di: any) => ({
                ...di,
                id: di.id?.toString(),
                syncId: di.syncId?.toString(),
                entityId: di.entityId?.toString(),
                entity: di.entity ? {
                    ...di.entity,
                    id: di.entity.id?.toString(),
                    userId: di.entity.userId?.toString(),
                    credentialId: di.entity.credentialId?.toString(),
                } : di.entity,
            })),
        };
    }

    async getSyncObject(name: string, dataIdentifier: unknown, entity: string | number): Promise<SyncData | null> {
        const intEntityId = this._convertId(entity as string);
        const syncList = await this.prisma.sync.findMany({
            where: {
                name,
                dataIdentifiers: {
                    some: {
                        idData: dataIdentifier,
                        entityId: intEntityId,
                    },
                },
            },
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });

        if (syncList.length === 1) {
            return this._convertSyncIds(syncList[0]);
        } else if (syncList.length === 0) {
            return null;
        } else {
            throw new Error(
                `There are multiple sync objects with the name ${name}, for entities [${syncList[0].entities}] [${syncList[1].entities}]`
            );
        }
    }

    async upsertSync(filter: SyncFilter, syncData: Record<string, unknown>): Promise<SyncData> {
        const where = this._convertFilterToWhere(filter);
        const existing = await this.prisma.sync.findFirst({ where });

        const convertedData: Record<string, unknown> = { ...syncData };
        if (convertedData.integrationId) {
            convertedData.integrationId = this._convertId(convertedData.integrationId as string);
        }

        if (existing) {
            const updated = await this.prisma.sync.update({
                where: { id: existing.id },
                data: convertedData,
            });
            return this._convertSyncIds(updated) as SyncData;
        }

        const created = await this.prisma.sync.create({
            data: convertedData,
        });
        return this._convertSyncIds(created) as SyncData;
    }

    async updateSync(id: string | number, updates: Record<string, unknown>): Promise<SyncData | null> {
        const intId = this._convertId(id as string);

        const convertedUpdates: Record<string, unknown> = { ...updates };
        if (convertedUpdates.integrationId) {
            convertedUpdates.integrationId = this._convertId(convertedUpdates.integrationId as string);
        }

        const updated = await this.prisma.sync.update({
            where: { id: intId },
            data: convertedUpdates,
        });
        return this._convertSyncIds(updated);
    }

    async addDataIdentifier(syncId: string | number, dataIdentifier: SyncDataIdentifier): Promise<SyncData | null> {
        const intSyncId = this._convertId(syncId as string);
        const intEntityId = this._convertId(dataIdentifier.entity as string);

        await this.prisma.dataIdentifier.create({
            data: {
                syncId: intSyncId,
                entityId: intEntityId,
                idData: dataIdentifier.id,
                hash: dataIdentifier.hash,
            },
        });

        const sync = await this.prisma.sync.findUnique({
            where: { id: intSyncId },
            include: {
                dataIdentifiers: true,
            },
        });
        return this._convertSyncIds(sync);
    }

    getEntityObjIdForEntityIdFromObject(syncObj: SyncData, entityId: string | number): unknown {
        if (!syncObj.dataIdentifiers) {
            throw new Error('Sync object must include dataIdentifiers');
        }

        for (const dataIdentifier of syncObj.dataIdentifiers) {
            if (dataIdentifier.entityId === entityId) {
                return dataIdentifier.idData;
            }
        }

        throw new Error(
            `Sync object ${syncObj.id} does not contain a data identifier for entity ${entityId}`
        );
    }

    async findSyncs(filter: SyncFilter): Promise<SyncData[]> {
        const where = this._convertFilterToWhere(filter);
        const syncs = await this.prisma.sync.findMany({
            where,
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });
        return syncs.map((sync: any) => this._convertSyncIds(sync) as SyncData);
    }

    async findOneSync(filter: SyncFilter): Promise<SyncData | null> {
        const where = this._convertFilterToWhere(filter);
        const sync = await this.prisma.sync.findFirst({
            where,
            include: {
                entities: true,
                dataIdentifiers: {
                    include: {
                        entity: true,
                    },
                },
            },
        });
        return this._convertSyncIds(sync);
    }

    async deleteSync(id: string | number): Promise<unknown> {
        const intId = this._convertId(id as string);
        const deleted = await this.prisma.sync.delete({
            where: { id: intId },
        });
        return this._convertSyncIds(deleted);
    }

    private _convertFilterToWhere(filter: SyncFilter): Record<string, unknown> {
        const where: Record<string, unknown> = {};

        if (filter._id) {
            where.id = this._convertId(filter._id);
        }

        if (filter.id) {
            where.id = this._convertId(filter.id);
        }

        if (filter.integrationId) {
            where.integrationId = this._convertId(filter.integrationId);
        }

        if (filter.integration) {
            where.integrationId = this._convertId(filter.integration);
        }

        const { _id, id, integrationId, integration, ...rest } = filter;
        return { ...where, ...rest };
    }
}
