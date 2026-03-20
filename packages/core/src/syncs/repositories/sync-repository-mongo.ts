import { SyncRepositoryInterface } from './sync-repository-interface';
import type { SyncData, SyncDataIdentifier, SyncFilter } from './sync-repository-interface';

const { prisma } = require('../../database/prisma');

export class SyncRepositoryMongo extends SyncRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async getSyncObject(name: string, dataIdentifier: unknown, entity: string | number): Promise<SyncData | null> {
        const syncList = await this.prisma.sync.findMany({
            where: {
                name,
                dataIdentifiers: {
                    some: {
                        idData: dataIdentifier,
                        entityId: entity,
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
            return syncList[0];
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

        if (existing) {
            return await this.prisma.sync.update({
                where: { id: existing.id },
                data: syncData,
            });
        }

        return await this.prisma.sync.create({
            data: syncData,
        });
    }

    async updateSync(id: string | number, updates: Record<string, unknown>): Promise<SyncData> {
        return await this.prisma.sync.update({
            where: { id },
            data: updates,
        });
    }

    async addDataIdentifier(syncId: string | number, dataIdentifier: SyncDataIdentifier): Promise<SyncData | null> {
        await this.prisma.dataIdentifier.create({
            data: {
                syncId,
                entityId: dataIdentifier.entity,
                idData: dataIdentifier.id,
                hash: dataIdentifier.hash,
            },
        });

        return await this.prisma.sync.findUnique({
            where: { id: syncId },
            include: {
                dataIdentifiers: true,
            },
        });
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
        return await this.prisma.sync.findMany({
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
    }

    async findOneSync(filter: SyncFilter): Promise<SyncData | null> {
        const where = this._convertFilterToWhere(filter);
        return await this.prisma.sync.findFirst({
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
    }

    async deleteSync(id: string | number): Promise<unknown> {
        return await this.prisma.sync.delete({
            where: { id },
        });
    }

    private _convertFilterToWhere(filter: SyncFilter): Record<string, unknown> {
        const where: Record<string, unknown> = {};

        if (filter._id) {
            where.id = filter._id;
            delete filter._id;
        }

        return { ...where, ...filter };
    }
}
