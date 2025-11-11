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
const { Cryptor } = require('../../encrypt/Cryptor');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');

class ModuleRepositoryDocumentDB extends ModuleRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this._initializeCryptor();
    }

    _initializeCryptor() {
        // Match logic from @friggframework/core/database/prisma.js
        const stage = process.env.STAGE || process.env.NODE_ENV || 'development';
        const bypassEncryption = ['dev', 'test', 'local'].includes(stage.toLowerCase());

        if (bypassEncryption) {
            this.cryptor = null;
            return;
        }

        // Determine encryption method
        const hasKMS = process.env.KMS_KEY_ARN && process.env.KMS_KEY_ARN.trim() !== '';
        const hasAES = process.env.AES_KEY_ID && process.env.AES_KEY_ID.trim() !== '';

        if (!hasKMS && !hasAES) {
            console.warn('No encryption keys configured. Encryption disabled.');
            this.cryptor = null;
            return;
        }

        const shouldUseAws = hasKMS;
        this.cryptor = new Cryptor({ shouldUseAws });
    }

    _isEncryptedValue(value) {
        // Envelope encryption format: "keyId:encryptedPart1:encryptedPart2:encryptedKey"
        // Must be string with at least 4 colon-separated parts
        if (typeof value !== 'string') {
            return false;
        }

        const parts = value.split(':');
        return parts.length >= 4;
    }

    async _decryptField(encryptedValue, context = '') {
        // If encryption is disabled, return as-is
        if (!this.cryptor) {
            return encryptedValue;
        }

        // If not encrypted format, return as-is
        if (!this._isEncryptedValue(encryptedValue)) {
            return encryptedValue;
        }

        try {
            // Decrypt using Cryptor
            const decryptedString = await this.cryptor.decrypt(encryptedValue);

            // Try to parse as JSON (for objects/arrays)
            try {
                return JSON.parse(decryptedString);
            } catch {
                // Not JSON, return as string
                return decryptedString;
            }
        } catch (error) {
            console.error(`Failed to decrypt field${context ? ` (${context})` : ''}:`, error.message);
            // Return null on decryption failure to avoid exposing encrypted data
            return null;
        }
    }

    async _decryptCredentialData(rawData) {
        if (!rawData || typeof rawData !== 'object') {
            return rawData;
        }

        // Get encrypted fields from registry
        const encryptedFieldsConfig = getEncryptedFields('Credential');
        if (!encryptedFieldsConfig || !encryptedFieldsConfig.fields) {
            return rawData;
        }

        const decrypted = {};

        for (const [key, value] of Object.entries(rawData)) {
            // Check if this field is in the encrypted fields list
            const isEncrypted = encryptedFieldsConfig.fields.some(field => {
                // Support both top-level and nested fields (e.g., 'data.access_token')
                const fieldPath = field.split('.');
                return fieldPath[fieldPath.length - 1] === key;
            });

            if (isEncrypted) {
                // Decrypt encrypted fields
                decrypted[key] = await this._decryptField(value, `Credential.data.${key}`);
            } else {
                // Pass through non-encrypted fields
                decrypted[key] = value;
            }
        }

        return decrypted;
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
        const document = {
            userId: toObjectId(entityData.user || entityData.userId),
            credentialId: toObjectId(entityData.credential || entityData.credentialId) || null,
            name: entityData.name ?? null,
            moduleName: entityData.moduleName ?? null,
            externalId: entityData.externalId ?? null,
            accountId: entityData.accountId ?? null,
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

        try {
            // Convert to ObjectId for raw query
            const objectId = toObjectId(id);
            if (!objectId) return null;

            // Use raw findOne to bypass Prisma encryption extension
            const rawCredential = await findOne(this.prisma, 'Credential', {
                _id: objectId
            });

            if (!rawCredential) return null;

            // Manually decrypt data field
            const decryptedData = await this._decryptCredentialData(
                rawCredential.data || {}
            );

            // Return in same format
            const credential = {
                id: fromObjectId(rawCredential._id),
                userId: fromObjectId(rawCredential.userId),
                externalId: rawCredential.externalId ?? null,
                authIsValid: rawCredential.authIsValid ?? null,
                createdAt: rawCredential.createdAt,
                updatedAt: rawCredential.updatedAt,
                data: decryptedData
            };

            return this._convertCredentialIds(credential);
        } catch (error) {
            console.error(`Failed to fetch/decrypt credential ${id}:`, error.message);
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
                    // Manually decrypt the data field
                    const decryptedData = await this._decryptCredentialData(
                        rawCredential.data || {}
                    );

                    // Build credential object in same format as Prisma would return
                    const credential = {
                        id: fromObjectId(rawCredential._id),
                        userId: fromObjectId(rawCredential.userId),
                        externalId: rawCredential.externalId ?? null,
                        authIsValid: rawCredential.authIsValid ?? null,
                        createdAt: rawCredential.createdAt,
                        updatedAt: rawCredential.updatedAt,
                        data: decryptedData
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

