import { prisma } from '../../database/prisma';
import { ModuleRepositoryInterface } from './module-repository-interface';
import type { EntityFilter, EntityData } from './module-repository-interface';
import type { Entity, Credential } from '../module';

interface PrismaEntity {
    id: string;
    userId?: string;
    name?: string;
    externalId?: string;
    moduleName?: string;
    credentialId?: string | null;
    data?: Record<string, unknown> | null;
}

export class ModuleRepositoryMongo extends ModuleRepositoryInterface {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    private _toString(value: unknown): string | null | undefined {
        if (value === null || value === undefined) return value as null | undefined;
        return String(value);
    }

    private async _fetchCredential(credentialId: string | null | undefined): Promise<Credential | null> {
        if (!credentialId) return null;

        const credential = await this.prisma.credential.findUnique({
            where: { id: credentialId },
        });

        return credential;
    }

    private async _fetchCredentialsBulk(credentialIds: (string | null | undefined)[]): Promise<Map<string, Credential>> {
        if (!credentialIds || credentialIds.length === 0) {
            return new Map();
        }

        const validIds = credentialIds.filter((id): id is string => id !== null && id !== undefined);

        if (validIds.length === 0) {
            return new Map();
        }

        const credentials = await this.prisma.credential.findMany({
            where: { id: { in: validIds } },
        });

        const credentialMap = new Map<string, Credential>();
        for (const credential of credentials) {
            credentialMap.set(credential.id, credential);
        }

        return credentialMap;
    }

    private _mapEntity(e: PrismaEntity, credential: Credential | null): Entity {
        return {
            id: e.id,
            credential: credential ?? undefined,
            userId: e.userId,
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
            ...(e.data || {}),
        };
    }

    async findEntityById(entityId: string): Promise<Entity> {
        const entity = await this.prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const credential = await this._fetchCredential(entity.credentialId);
        return this._mapEntity(entity, credential);
    }

    async findEntitiesByUserId(userId: string): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { userId },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async findEntitiesByIds(entitiesIds: string[]): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { id: { in: entitiesIds } },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async findEntitiesByUserIdAndModuleName(userId: string, moduleName: string): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { userId, moduleName },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async unsetCredential(entityId: string): Promise<boolean> {
        await this.prisma.entity.update({
            where: { id: entityId },
            data: { credentialId: null },
        });

        return true;
    }

    async findEntity(filter: EntityFilter): Promise<Entity | null> {
        const where = this._convertFilterToWhere(filter);
        const entity = await this.prisma.entity.findFirst({
            where,
        });

        if (!entity) {
            return null;
        }

        const credential = await this._fetchCredential(entity.credentialId);
        return this._mapEntity(entity, credential);
    }

    async createEntity(entityData: EntityData): Promise<Entity> {
        const {
            user,
            userId,
            credential,
            credentialId,
            name,
            moduleName,
            externalId,
            ...dynamicData
        } = entityData;

        const data = {
            userId: userId || user,
            credentialId: credentialId || credential,
            name,
            moduleName,
            externalId,
            data: dynamicData,
        };

        const entity = await this.prisma.entity.create({
            data,
        });

        const credentialObj = await this._fetchCredential(entity.credentialId);

        return this._mapEntity(entity, credentialObj);
    }

    async updateEntity(entityId: string, updates: EntityData): Promise<Entity | null> {
        const existing = await this.prisma.entity.findUnique({
            where: { id: entityId },
        });

        if (!existing) {
            return null;
        }

        const {
            user,
            userId,
            credential,
            credentialId,
            name,
            moduleName,
            externalId,
            ...dynamicData
        } = updates;

        const schemaUpdates: Record<string, unknown> = {};
        if (user !== undefined || userId !== undefined) {
            schemaUpdates.userId = userId || user;
        }
        if (credential !== undefined || credentialId !== undefined) {
            schemaUpdates.credentialId = credentialId || credential;
        }
        if (name !== undefined) schemaUpdates.name = name;
        if (moduleName !== undefined) schemaUpdates.moduleName = moduleName;
        if (externalId !== undefined) schemaUpdates.externalId = externalId;

        if (Object.keys(dynamicData).length > 0) {
            schemaUpdates.data = { ...(existing.data || {}), ...dynamicData };
        }

        try {
            const entity = await this.prisma.entity.update({
                where: { id: entityId },
                data: schemaUpdates,
            });

            const credentialObj = await this._fetchCredential(entity.credentialId);
            return this._mapEntity(entity, credentialObj);
        } catch (error: unknown) {
            if ((error as { code?: string }).code === 'P2025') {
                return null;
            }
            throw error;
        }
    }

    async deleteEntity(entityId: string): Promise<boolean> {
        try {
            await this.prisma.entity.delete({
                where: { id: entityId },
            });
            return true;
        } catch (error: unknown) {
            if ((error as { code?: string }).code === 'P2025') {
                return false;
            }
            throw error;
        }
    }

    _convertFilterToWhere(filter: EntityFilter): Record<string, unknown> {
        const where: Record<string, unknown> = {};

        if (filter._id) where.id = filter._id;
        if (filter.user) where.userId = filter.user;
        if (filter.credential) where.credentialId = filter.credential;
        if (filter.id) where.id = filter.id;
        if (filter.userId) where.userId = filter.userId;
        if (filter.credentialId) where.credentialId = filter.credentialId;
        if (filter.name) where.name = filter.name;
        if (filter.moduleName) where.moduleName = filter.moduleName;
        if (filter.externalId) where.externalId = this._toString(filter.externalId);

        return where;
    }
}
