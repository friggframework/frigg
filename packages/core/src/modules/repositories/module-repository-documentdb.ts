import { prisma } from '../../database/prisma';
import {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} from '../../database/documentdb-utils';
import { ModuleRepositoryInterface } from './module-repository-interface';
import type { EntityFilter, EntityData } from './module-repository-interface';
import type { Entity, Credential } from '../module';
import { DocumentDBEncryptionService } from '../../database/documentdb-encryption-service';

interface RawDocument {
    _id?: unknown;
    userId?: unknown;
    name?: string | null;
    externalId?: string | null;
    moduleName?: string | null;
    credentialId?: unknown;
    data?: Record<string, unknown> | null;
    [key: string]: unknown;
}

export class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma: any;
    encryptionService: DocumentDBEncryptionService;

    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async findEntityById(entityId: string): Promise<Entity> {
        const objectId = toObjectId(entityId);
        if (!objectId) {
            throw new Error(`Entity ${entityId} not found`);
        }
        const doc = await findOne(this.prisma, 'Entity', { _id: objectId });
        if (!doc) {
            throw new Error(`Entity ${entityId} not found`);
        }
        const credential = await this._fetchCredential(doc.credentialId);
        return this._mapEntity(doc, credential);
    }

    async findEntitiesByUserId(userId: string): Promise<Entity[]> {
        const objectId = toObjectId(userId);
        if (!objectId) {
            throw new Error(`Invalid userId: ${userId}`);
        }
        const filter = { userId: objectId };
        const docs: RawDocument[] = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId) ?? '') || null));
    }

    async findEntitiesByIds(entitiesIds: string[]): Promise<Entity[]> {
        const ids = (entitiesIds || []).map((id) => toObjectId(id)).filter(Boolean);
        if (ids.length === 0) return [];
        const docs: RawDocument[] = await findMany(this.prisma, 'Entity', { _id: { $in: ids } });
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId) ?? '') || null));
    }

    async findEntitiesByUserIdAndModuleName(userId: string, moduleName: string): Promise<Entity[]> {
        const objectId = toObjectId(userId);
        if (!objectId) {
            throw new Error(`Invalid userId: ${userId}`);
        }
        const filter = { userId: objectId, moduleName };
        const docs: RawDocument[] = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId) ?? '') || null));
    }

    async unsetCredential(entityId: string): Promise<boolean> {
        const objectId = toObjectId(entityId);
        if (!objectId) return false;
        await updateOne(
            this.prisma,
            'Entity',
            { _id: objectId },
            { $set: { credentialId: null } }
        );
        return true;
    }

    async findEntity(filter: EntityFilter): Promise<Entity | null> {
        const query = this._buildFilter(filter);
        const doc = await findOne(this.prisma, 'Entity', query);
        if (!doc) return null;
        const credential = await this._fetchCredential(doc.credentialId);
        return this._mapEntity(doc, credential);
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

        const document = {
            userId: toObjectId(userId || user),
            credentialId: toObjectId(credentialId || credential) || null,
            name: name ?? null,
            moduleName: moduleName ?? null,
            externalId: externalId ?? null,
            data: dynamicData,
        };
        const insertedId = await insertOne(this.prisma, 'Entity', document);
        const created = await findOne(this.prisma, 'Entity', { _id: insertedId });
        const credentialObj = await this._fetchCredential(created?.credentialId);
        return this._mapEntity(created, credentialObj);
    }

    async updateEntity(entityId: string, updates: EntityData): Promise<Entity | null> {
        const objectId = toObjectId(entityId);
        if (!objectId) return null;

        const existing = await findOne(this.prisma, 'Entity', { _id: objectId });
        if (!existing) return null;

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

        const updatePayload: Record<string, unknown> = {};
        if (user !== undefined || userId !== undefined) {
            updatePayload.userId = toObjectId(userId || user) || null;
        }
        if (credential !== undefined || credentialId !== undefined) {
            updatePayload.credentialId = toObjectId(credentialId || credential) || null;
        }
        if (name !== undefined) updatePayload.name = name;
        if (moduleName !== undefined) updatePayload.moduleName = moduleName;
        if (externalId !== undefined) updatePayload.externalId = externalId;

        if (Object.keys(dynamicData).length > 0) {
            updatePayload.data = { ...(existing.data || {}), ...dynamicData };
        }

        await updateOne(
            this.prisma,
            'Entity',
            { _id: objectId },
            { $set: updatePayload }
        );
        const updated = await findOne(this.prisma, 'Entity', { _id: objectId });
        if (!updated) return null;
        const credentialObj = await this._fetchCredential(updated?.credentialId);
        return this._mapEntity(updated, credentialObj);
    }

    async deleteEntity(entityId: string): Promise<boolean> {
        const objectId = toObjectId(entityId);
        if (!objectId) return false;
        const result = await deleteOne(this.prisma, 'Entity', { _id: objectId });
        const deleted = (result as { n?: number })?.n ?? 0;
        return deleted > 0;
    }

    private async _fetchCredential(credentialId: unknown): Promise<Credential | null> {
        const id = fromObjectId(credentialId);
        if (!id) return null;

        try {
            const objectId = toObjectId(id);
            if (!objectId) return null;

            const rawCredential = await findOne(this.prisma, 'Credential', {
                _id: objectId
            });

            if (!rawCredential) return null;

            const decryptedCredential = await this.encryptionService.decryptFields('Credential', rawCredential);

            const credential: Credential = {
                id: fromObjectId(decryptedCredential._id) ?? undefined,
                userId: fromObjectId(decryptedCredential.userId) ?? undefined,
                externalId: (decryptedCredential.externalId as string) ?? undefined,
                authIsValid: (decryptedCredential.authIsValid as boolean) ?? undefined,
                data: decryptedCredential.data as Record<string, unknown> | undefined
            };

            return this._convertCredentialIds(credential);
        } catch (error: unknown) {
            console.error(`Failed to fetch/decrypt credential ${id}:`, (error as Error).message);
            return null;
        }
    }

    private async _fetchCredentialsBulk(credentialIds: unknown[]): Promise<Map<string, Credential>> {
        const ids = (credentialIds || [])
            .map((value) => fromObjectId(value))
            .filter((value): value is string => value !== null && value !== undefined);
        if (ids.length === 0) return new Map();

        try {
            const objectIds = ids.map(id => toObjectId(id)).filter(Boolean);
            if (objectIds.length === 0) return new Map();

            const rawCredentials = await findMany(this.prisma, 'Credential', {
                _id: { $in: objectIds }
            });

            const decryptionPromises = rawCredentials.map(async (rawCredential: RawDocument) => {
                try {
                    const decryptedCredential = await this.encryptionService.decryptFields('Credential', rawCredential);

                    const credential: Credential = {
                        id: fromObjectId(decryptedCredential._id) ?? undefined,
                        userId: fromObjectId(decryptedCredential.userId) ?? undefined,
                        externalId: (decryptedCredential.externalId as string) ?? undefined,
                        authIsValid: (decryptedCredential.authIsValid as boolean) ?? undefined,
                        data: decryptedCredential.data as Record<string, unknown> | undefined
                    };

                    return this._convertCredentialIds(credential);
                } catch (error: unknown) {
                    const credId = fromObjectId(rawCredential._id);
                    console.error(`Failed to decrypt credential ${credId}:`, (error as Error).message);
                    return null;
                }
            });

            const decryptedCredentials = await Promise.all(decryptionPromises);

            const map = new Map<string, Credential>();
            decryptedCredentials.forEach(credential => {
                if (credential?.id) {
                    map.set(credential.id, credential);
                }
            });

            return map;
        } catch (error: unknown) {
            console.error('Failed to fetch credentials bulk:', (error as Error).message);
            return new Map();
        }
    }

    private _convertCredentialIds(credential: Credential | null): Credential | null {
        if (!credential) return credential;
        return {
            ...credential,
            id: credential.id ? String(credential.id) : undefined,
            userId: credential.userId ? String(credential.userId) : undefined,
        };
    }

    private _buildFilter(filter: EntityFilter): Record<string, unknown> {
        const query: Record<string, unknown> = {};
        if (!filter) return query;
        if (filter._id || filter.id) {
            const idObj = toObjectId(filter._id || filter.id);
            if (idObj) query._id = idObj;
        }
        if (filter.user || filter.userId) {
            const userObj = toObjectId(filter.user || filter.userId);
            if (userObj) query.userId = userObj;
        }
        if (filter.credential || filter.credentialId) {
            const credObj = toObjectId(filter.credential || filter.credentialId);
            if (credObj) query.credentialId = credObj;
        }
        if (filter.name) query.name = filter.name;
        if (filter.moduleName) query.moduleName = filter.moduleName;
        if (filter.externalId) query.externalId = filter.externalId;
        return query;
    }

    private _mapEntity(doc: RawDocument | null, credential: Credential | null): Entity {
        const dynamicData = doc?.data || {};
        return {
            id: fromObjectId(doc?._id) ?? undefined,
            credential: credential ?? undefined,
            userId: fromObjectId(doc?.userId) ?? undefined,
            name: doc?.name ?? undefined,
            externalId: doc?.externalId ?? undefined,
            moduleName: doc?.moduleName ?? undefined,
            ...dynamicData,
        };
    }
}
