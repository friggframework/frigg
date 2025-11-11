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
const { ModuleRepositoryInterface } = require('./module-repository-interface');

class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findEntityById(entityId) {
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

    async findEntitiesByUserId(userId) {
        const objectId = toObjectId(userId);
        const filter = objectId ? { userId: objectId } : {};
        const docs = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || credentialMap.get(doc.credentialId) || null));
    }

    async findEntitiesByIds(entitiesIds) {
        const ids = (entitiesIds || []).map((id) => toObjectId(id)).filter(Boolean);
        if (ids.length === 0) return [];
        const docs = await findMany(this.prisma, 'Entity', { _id: { $in: ids } });
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || credentialMap.get(doc.credentialId) || null));
    }

    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        const objectId = toObjectId(userId);
        const filter = {
            ...(objectId ? { userId: objectId } : {}),
            moduleName,
        };
        const docs = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || credentialMap.get(doc.credentialId) || null));
    }

    async unsetCredential(entityId) {
        const objectId = toObjectId(entityId);
        if (!objectId) return false;
        await updateOne(
            this.prisma,
            'Entity',
            { _id: objectId },
            {
                $set: {
                    credentialId: null,
                    updatedAt: new Date(),
                },
            }
        );
        return true;
    }

    async findEntity(filter) {
        const query = this._buildFilter(filter);
        const doc = await findOne(this.prisma, 'Entity', query);
        if (!doc) return null;
        const credential = await this._fetchCredential(doc.credentialId);
        return this._mapEntity(doc, credential);
    }

    async createEntity(entityData) {
        const now = new Date();
        const document = {
            userId: toObjectId(entityData.user || entityData.userId),
            credentialId: toObjectId(entityData.credential || entityData.credentialId) || null,
            name: entityData.name ?? null,
            moduleName: entityData.moduleName ?? null,
            externalId: entityData.externalId ?? null,
            accountId: entityData.accountId ?? null,
            integrationIds: (entityData.integrationIds || []).map((id) => toObjectId(id)).filter(Boolean),
            syncIds: (entityData.syncIds || []).map((id) => toObjectId(id)).filter(Boolean),
            createdAt: now,
            updatedAt: now,
        };
        const insertedId = await insertOne(this.prisma, 'Entity', document);
        const created = await findOne(this.prisma, 'Entity', { _id: insertedId });
        const credential = await this._fetchCredential(created?.credentialId);
        return this._mapEntity(created, credential);
    }

    async updateEntity(entityId, updates) {
        const objectId = toObjectId(entityId);
        if (!objectId) return null;
        const updatePayload = {};
        if (updates.user !== undefined || updates.userId !== undefined) {
            const userVal = updates.user !== undefined ? updates.user : updates.userId;
            updatePayload.userId = toObjectId(userVal) || null;
        }
        if (updates.credential !== undefined || updates.credentialId !== undefined) {
            const credVal = updates.credential !== undefined ? updates.credential : updates.credentialId;
            updatePayload.credentialId = toObjectId(credVal) || null;
        }
        if (updates.name !== undefined) updatePayload.name = updates.name;
        if (updates.moduleName !== undefined) updatePayload.moduleName = updates.moduleName;
        if (updates.externalId !== undefined) updatePayload.externalId = updates.externalId;
        if (updates.accountId !== undefined) updatePayload.accountId = updates.accountId;
        if (updates.integrationIds !== undefined) {
            updatePayload.integrationIds = (updates.integrationIds || []).map((id) => toObjectId(id)).filter(Boolean);
        }
        if (updates.syncIds !== undefined) {
            updatePayload.syncIds = (updates.syncIds || []).map((id) => toObjectId(id)).filter(Boolean);
        }
        updatePayload.updatedAt = new Date();
        const result = await updateOne(
            this.prisma,
            'Entity',
            { _id: objectId },
            { $set: updatePayload }
        );
        const modified = result?.nModified ?? result?.n ?? 0;
        if (modified === 0) return null;
        const updated = await findOne(this.prisma, 'Entity', { _id: objectId });
        const credential = await this._fetchCredential(updated?.credentialId);
        return this._mapEntity(updated, credential);
    }

    async deleteEntity(entityId) {
        const objectId = toObjectId(entityId);
        if (!objectId) return false;
        const result = await deleteOne(this.prisma, 'Entity', { _id: objectId });
        const deleted = result?.n ?? 0;
        return deleted > 0;
    }

    async _fetchCredential(credentialId) {
        const id = fromObjectId(credentialId);
        if (!id) return null;
        return this.prisma.credential.findUnique({
            where: { id },
        });
    }

    async _fetchCredentialsBulk(credentialIds) {
        const ids = (credentialIds || [])
            .map((value) => fromObjectId(value))
            .filter((value) => value !== null && value !== undefined);
        if (ids.length === 0) return new Map();
        const credentials = await this.prisma.credential.findMany({
            where: { id: { in: ids } },
        });
        const map = new Map();
        for (const credential of credentials) {
            map.set(credential.id, credential);
        }
        return map;
    }

    _buildFilter(filter) {
        const query = {};
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
        if (filter.name !== undefined) query.name = filter.name;
        if (filter.moduleName !== undefined) query.moduleName = filter.moduleName;
        if (filter.externalId !== undefined) query.externalId = filter.externalId;
        if (filter.accountId !== undefined) query.accountId = filter.accountId;
        return query;
    }

    _mapEntity(doc, credential) {
        return {
            id: fromObjectId(doc?._id),
            accountId: doc?.accountId ?? null,
            credential,
            userId: fromObjectId(doc?.userId),
            name: doc?.name ?? null,
            externalId: doc?.externalId ?? null,
            moduleName: doc?.moduleName ?? null,
        };
    }
}

module.exports = { ModuleRepositoryDocumentDB };

