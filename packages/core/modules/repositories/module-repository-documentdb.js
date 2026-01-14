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
const { DocumentDBEncryptionService } = require('../../database/documentdb-encryption-service');

/**
 * Module/Entity repository for DocumentDB.
 * Uses DocumentDBEncryptionService for credential decryption.
 *
 * Encrypted fields: Credential.data.*
 *
 * Note: This repository only reads credentials. CredentialRepository
 * handles credential creation/updates with encryption.
 *
 * @see DocumentDBEncryptionService
 * @see CredentialRepositoryDocumentDB
 */
class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
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
        if (!objectId) {
            throw new Error(`Invalid userId: ${userId}`);
        }
        const filter = { userId: objectId };
        const docs = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || null));
    }

    async findEntitiesByIds(entitiesIds) {
        const ids = (entitiesIds || []).map((id) => toObjectId(id)).filter(Boolean);
        if (ids.length === 0) return [];
        const docs = await findMany(this.prisma, 'Entity', { _id: { $in: ids } });
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || null));
    }

    async findEntitiesByUserIdAndModuleName(userId, moduleName) {
        const objectId = toObjectId(userId);
        if (!objectId) {
            throw new Error(`Invalid userId: ${userId}`);
        }
        const filter = {
            userId: objectId,
            moduleName,
        };
        const docs = await findMany(this.prisma, 'Entity', filter);
        const credentialMap = await this._fetchCredentialsBulk(docs.map((doc) => doc.credentialId));
        return docs.map((doc) => this._mapEntity(doc, credentialMap.get(fromObjectId(doc.credentialId)) || null));
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

    async updateEntity(entityId, updates) {
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

        const updatePayload = {};
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

        try {
            // Convert to ObjectId for raw query
            const objectId = toObjectId(id);
            if (!objectId) return null;

            // Use raw findOne to bypass Prisma encryption extension
            const rawCredential = await findOne(this.prisma, 'Credential', {
                _id: objectId
            });

            if (!rawCredential) return null;

            // Decrypt sensitive fields using service
            const decryptedCredential = await this.encryptionService.decryptFields('Credential', rawCredential);

            // Return in same format
            const credential = {
                id: fromObjectId(decryptedCredential._id),
                userId: fromObjectId(decryptedCredential.userId),
                externalId: decryptedCredential.externalId ?? null,
                authIsValid: decryptedCredential.authIsValid ?? null,
                createdAt: decryptedCredential.createdAt,
                updatedAt: decryptedCredential.updatedAt,
                data: decryptedCredential.data
            };

            return this._convertCredentialIds(credential);
        } catch (error) {
            console.error(`Failed to fetch/decrypt credential ${id}:`, error.message);
            // Return null instead of throwing to allow graceful degradation
            // This repository is read-only (doesn't create/update credentials)
            // Entities can still be loaded even if their credential is corrupted/unreadable
            // The entity will have null credential, which calling code must handle
            // This is intentional behavior: prefer partial data over complete failure
            return null;
        }
    }

    async _fetchCredentialsBulk(credentialIds) {
        const ids = (credentialIds || [])
            .map((value) => fromObjectId(value))
            .filter((value) => value !== null && value !== undefined);
        if (ids.length === 0) return new Map();

        try {
            // Convert string IDs to ObjectIds for bulk query
            const objectIds = ids.map(id => toObjectId(id)).filter(Boolean);
            if (objectIds.length === 0) return new Map();

            // Use raw findMany to bypass Prisma encryption extension
            const rawCredentials = await findMany(this.prisma, 'Credential', {
                _id: { $in: objectIds }
            });

            // Decrypt all credentials in parallel
            const decryptionPromises = rawCredentials.map(async (rawCredential) => {
                try {
                    // Decrypt sensitive fields using service
                    const decryptedCredential = await this.encryptionService.decryptFields('Credential', rawCredential);

                    // Build credential object in same format as Prisma would return
                    const credential = {
                        id: fromObjectId(decryptedCredential._id),
                        userId: fromObjectId(decryptedCredential.userId),
                        externalId: decryptedCredential.externalId ?? null,
                        authIsValid: decryptedCredential.authIsValid ?? null,
                        createdAt: decryptedCredential.createdAt,
                        updatedAt: decryptedCredential.updatedAt,
                        data: decryptedCredential.data
                    };

                    return this._convertCredentialIds(credential);
                } catch (error) {
                    const credId = fromObjectId(rawCredential._id);
                    console.error(`Failed to decrypt credential ${credId}:`, error.message);
                    return null;
                }
            });

            // Wait for all decryptions to complete
            const decryptedCredentials = await Promise.all(decryptionPromises);

            // Build Map from results, filtering out nulls
            const map = new Map();
            decryptedCredentials.forEach(credential => {
                if (credential) {
                    map.set(credential.id, credential);
                }
            });

            return map;
        } catch (error) {
            console.error('Failed to fetch credentials bulk:', error.message);
            return new Map();
        }
    }

    /**
     * Convert credential object IDs to strings for application layer
     * Ensures consistent credential format across database adapters
     * @private
     * @param {Object|null} credential - Credential object from database
     * @returns {Object|null} Credential with properly formatted IDs
     */
    _convertCredentialIds(credential) {
        if (!credential) return credential;
        return {
            ...credential,
            id: credential.id ? String(credential.id) : null,
            userId: credential.userId ? String(credential.userId) : null,
        };
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
        if (filter.name) query.name = filter.name;
        if (filter.moduleName) query.moduleName = filter.moduleName;
        if (filter.externalId) query.externalId = filter.externalId;
        return query;
    }

    _mapEntity(doc, credential) {
        const dynamicData = doc?.data || {};
        return {
            id: fromObjectId(doc?._id),
            credential,
            userId: fromObjectId(doc?.userId),
            name: doc?.name ?? null,
            externalId: doc?.externalId ?? null,
            moduleName: doc?.moduleName ?? null,
            ...dynamicData,
        };
    }
}

module.exports = { ModuleRepositoryDocumentDB };

