import { prisma } from '../../database/prisma';
import { ModuleRepositoryInterface } from './module-repository-interface';
import type { EntityFilter, EntityData } from './module-repository-interface';
import type { Entity } from '../module';

interface PrismaEntity {
    id: string;
    credential?: Record<string, unknown> | null;
    userId?: string;
    name?: string;
    externalId?: string;
    moduleName?: string;
    credentialId?: string | null;
    data?: Record<string, unknown> | null;
}

function mapEntity(e: PrismaEntity): Entity {
    return {
        id: e.id,
        credential: e.credential as Entity['credential'],
        userId: e.userId,
        name: e.name,
        externalId: e.externalId,
        moduleName: e.moduleName,
        ...(e.data || {}),
    };
}

export class ModuleRepository extends ModuleRepositoryInterface {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any;

    constructor(prismaClient: unknown = prisma) {
        super();
        this.prisma = prismaClient;
    }

    async findEntityById(entityId: string): Promise<Entity> {
        const entity = await this.prisma.entity.findUnique({
            where: { id: entityId },
            include: { credential: true },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        return mapEntity(entity);
    }

    async findEntitiesByUserId(userId: string): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { userId },
            include: { credential: true },
        });

        return entities.map(mapEntity);
    }

    async findEntitiesByIds(entitiesIds: string[]): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { id: { in: entitiesIds } },
            include: { credential: true },
        });

        return entities.map(mapEntity);
    }

    async findEntitiesByUserIdAndModuleName(userId: string, moduleName: string): Promise<Entity[]> {
        const entities = await this.prisma.entity.findMany({
            where: { userId, moduleName },
            include: { credential: true },
        });

        return entities.map(mapEntity);
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
            include: { credential: true },
        });

        if (!entity) {
            return null;
        }

        return mapEntity(entity);
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
            include: { credential: true },
        });

        return mapEntity(entity);
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
                include: { credential: true },
            });

            return mapEntity(entity);
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
        if (filter.externalId) where.externalId = filter.externalId;

        return where;
    }
}
