import { prisma } from '../../database/prisma';
import { ModuleRepositoryInterface } from './module-repository-interface';
import type { EntityFilter, EntityData } from './module-repository-interface';
import type { Entity, Credential } from '../module';

interface PrismaEntity {
    id: number;
    userId?: number | null;
    name?: string;
    externalId?: string;
    moduleName?: string;
    credentialId?: number | null;
    data?: Record<string, unknown> | null;
}

export class ModuleRepositoryPostgres extends ModuleRepositoryInterface {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any;

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

    private _toString(value: unknown): string | null | undefined {
        if (value === null || value === undefined) return value;
        return String(value);
    }

    private _convertCredentialIds(credential: Record<string, unknown> | null): Credential | null {
        if (!credential) return credential;
        return {
            ...credential,
            id: (credential.id as number)?.toString(),
            userId: (credential.userId as number)?.toString(),
        } as Credential;
    }

    private async _fetchCredential(credentialId: number | null | undefined): Promise<Credential | null> {
        if (!credentialId) return null;

        const credential = await this.prisma.credential.findUnique({
            where: { id: credentialId },
        });

        return this._convertCredentialIds(credential);
    }

    private async _fetchCredentialsBulk(credentialIds: (number | null | undefined)[]): Promise<Map<number, Credential>> {
        if (!credentialIds || credentialIds.length === 0) {
            return new Map();
        }

        const validIds = credentialIds.filter((id): id is number => id !== null && id !== undefined);

        if (validIds.length === 0) {
            return new Map();
        }

        const credentials = await this.prisma.credential.findMany({
            where: { id: { in: validIds } },
        });

        const credentialMap = new Map<number, Credential>();
        for (const credential of credentials) {
            const converted = this._convertCredentialIds(credential);
            if (converted) {
                credentialMap.set(credential.id, converted);
            }
        }

        return credentialMap;
    }

    private _mapEntity(e: PrismaEntity, credential: Credential | null): Entity {
        return {
            id: e.id.toString(),
            credential: credential ?? undefined,
            userId: e.userId?.toString(),
            name: e.name,
            externalId: e.externalId,
            moduleName: e.moduleName,
            ...(e.data || {}),
        };
    }

    async findEntityById(entityId: string): Promise<Entity> {
        const intId = this._convertId(entityId)!;

        const entity = await this.prisma.entity.findUnique({
            where: { id: intId },
        });

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        const credential = await this._fetchCredential(entity.credentialId);
        return this._mapEntity(entity, credential);
    }

    async findEntitiesByUserId(userId: string): Promise<Entity[]> {
        const intUserId = this._convertId(userId)!;

        const entities = await this.prisma.entity.findMany({
            where: { userId: intUserId },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async findEntitiesByIds(entitiesIds: string[]): Promise<Entity[]> {
        const intIds = entitiesIds.map((id) => this._convertId(id)!);

        const entities = await this.prisma.entity.findMany({
            where: { id: { in: intIds } },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async findEntitiesByUserIdAndModuleName(userId: string, moduleName: string): Promise<Entity[]> {
        const intUserId = this._convertId(userId)!;

        const entities = await this.prisma.entity.findMany({
            where: { userId: intUserId, moduleName },
        });

        const credentialIds = entities.map((e: PrismaEntity) => e.credentialId).filter(Boolean);
        const credentialMap = await this._fetchCredentialsBulk(credentialIds);

        return entities.map((e: PrismaEntity) =>
            this._mapEntity(e, credentialMap.get(e.credentialId!) || null)
        );
    }

    async unsetCredential(entityId: string): Promise<boolean> {
        const intId = this._convertId(entityId)!;
        await this.prisma.entity.update({
            where: { id: intId },
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
            userId: this._convertId(userId || user),
            credentialId: this._convertId(credentialId || credential),
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
        const intId = this._convertId(entityId)!;

        const existing = await this.prisma.entity.findUnique({
            where: { id: intId },
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
            schemaUpdates.userId = this._convertId(userId || user);
        }
        if (credential !== undefined || credentialId !== undefined) {
            schemaUpdates.credentialId = this._convertId(credentialId || credential);
        }
        if (name !== undefined) schemaUpdates.name = name;
        if (moduleName !== undefined) schemaUpdates.moduleName = moduleName;
        if (externalId !== undefined) schemaUpdates.externalId = externalId;

        if (Object.keys(dynamicData).length > 0) {
            schemaUpdates.data = { ...(existing.data || {}), ...dynamicData };
        }

        try {
            const entity = await this.prisma.entity.update({
                where: { id: intId },
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
            const intId = this._convertId(entityId)!;
            await this.prisma.entity.delete({
                where: { id: intId },
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

        if (filter._id) where.id = this._convertId(filter._id);
        if (filter.user) where.userId = this._convertId(filter.user);
        if (filter.credential) where.credentialId = this._convertId(filter.credential);
        if (filter.id) where.id = this._convertId(filter.id);
        if (filter.userId) where.userId = this._convertId(filter.userId);
        if (filter.credentialId) where.credentialId = this._convertId(filter.credentialId);
        if (filter.name) where.name = filter.name;
        if (filter.moduleName) where.moduleName = filter.moduleName;
        if (filter.externalId) where.externalId = this._toString(filter.externalId);

        return where;
    }
}
