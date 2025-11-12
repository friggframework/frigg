const bcrypt = require('bcryptjs');
const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const { createTokenRepository } = require('../../token/repositories/token-repository-factory');
const { UserRepositoryInterface } = require('./user-repository-interface');
const { Cryptor } = require('../../encrypt/Cryptor');
const { getEncryptedFields } = require('../../database/encryption/encryption-schema-registry');

class UserRepositoryDocumentDB extends UserRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
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

    async _encryptField(plainValue, context = '') {
        // If encryption is disabled, return as-is
        if (!this.cryptor) {
            return plainValue;
        }

        // Don't encrypt null/undefined
        if (plainValue === null || plainValue === undefined) {
            return plainValue;
        }

        try {
            // Convert objects/arrays to JSON string
            const stringValue = typeof plainValue === 'string'
                ? plainValue
                : JSON.stringify(plainValue);

            // Encrypt using Cryptor
            return await this.cryptor.encrypt(stringValue);
        } catch (error) {
            console.error(`Failed to encrypt field${context ? ` (${context})` : ''}:`, error.message);
            throw error;
        }
    }

    async _decryptHashword(rawUser) {
        if (!rawUser || !rawUser.hashword) {
            return rawUser;
        }

        // Get encrypted fields from registry
        const encryptedFieldsConfig = getEncryptedFields('User');
        const shouldDecrypt = encryptedFieldsConfig?.fields?.includes('hashword');

        if (!shouldDecrypt) {
            return rawUser;
        }

        const decryptedHashword = await this._decryptField(rawUser.hashword, 'User.hashword');

        return {
            ...rawUser,
            hashword: decryptedHashword
        };
    }

    async _encryptHashword(hashword) {
        if (!hashword) {
            return hashword;
        }

        // Get encrypted fields from registry
        const encryptedFieldsConfig = getEncryptedFields('User');
        const shouldEncrypt = encryptedFieldsConfig?.fields?.includes('hashword');

        if (!shouldEncrypt) {
            return hashword;
        }

        return await this._encryptField(hashword, 'User.hashword');
    }

    async getSessionToken(token) {
        const jsonToken = this.tokenRepository.getJSONTokenFromBase64BufferToken(token);
        const sessionToken = await this.tokenRepository.validateAndGetToken(jsonToken);
        return sessionToken;
    }

    async findOrganizationUserById(userId) {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(userId),
            type: 'ORGANIZATION',
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserById(userId) {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(userId),
            type: 'INDIVIDUAL',
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async createToken(userId, rawToken, minutes = 120) {
        const createdToken = await this.tokenRepository.createTokenWithExpire(
            fromObjectId(toObjectId(userId)),
            rawToken,
            minutes
        );
        return this.tokenRepository.createBase64BufferToken(createdToken, rawToken);
    }

    async createIndividualUser(params) {
        const now = new Date();
        const document = {
            type: 'INDIVIDUAL',
            email: params.email ?? null,
            username: params.username ?? null,
            appUserId: params.appUserId ?? null,
            organizationId: params.organization
                ? toObjectId(params.organization)
                : params.organizationId
                ? toObjectId(params.organizationId)
                : null,
            createdAt: now,
            updatedAt: now,
        };

        if (
            params.hashword !== undefined &&
            params.hashword !== null &&
            params.hashword !== ''
        ) {
            if (typeof params.hashword !== 'string') {
                throw new Error('Password must be a string');
            }

            if (params.hashword.startsWith('$2')) {
                throw new Error(
                    'Password appears to be already hashed. Pass plain text password only.'
                );
            }

            // Bcrypt hash the password
            const hashedPassword = await bcrypt.hash(params.hashword, 10);

            // Encrypt the bcrypt hash if encryption is enabled
            document.hashword = await this._encryptHashword(hashedPassword);
        }

        const insertedId = await insertOne(this.prisma, 'User', document);
        const created = await findOne(this.prisma, 'User', { _id: insertedId });

        // Defensive check: verify document was found after insert
        if (!created) {
            console.error('[UserRepositoryDocumentDB] User not found after insert', {
                insertedId: fromObjectId(insertedId),
                params: {
                    username: params.username,
                    appUserId: params.appUserId,
                    email: params.email
                }
            });
            throw new Error(
                'Failed to create individual user: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }

        // Decrypt hashword if present
        const decrypted = await this._decryptHashword(created);

        return this._mapUser(decrypted);
    }

    async createOrganizationUser(params) {
        const now = new Date();
        const document = {
            type: 'ORGANIZATION',
            appOrgId: params.appOrgId ?? null,
            name: params.name ?? null,
            createdAt: now,
            updatedAt: now,
        };

        const insertedId = await insertOne(this.prisma, 'User', document);
        const created = await findOne(this.prisma, 'User', { _id: insertedId });
        return this._mapUser(created);
    }

    async findIndividualUserByUsername(username) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'INDIVIDUAL',
            username,
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByAppUserId(appUserId) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'INDIVIDUAL',
            appUserId,
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'ORGANIZATION',
            appOrgId,
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async findUserById(userId) {
        const doc = await findOne(this.prisma, 'User', { _id: toObjectId(userId) });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByEmail(email) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'INDIVIDUAL',
            email,
        });
        const decrypted = await this._decryptHashword(doc);
        return this._mapUser(decrypted);
    }

    async updateIndividualUser(userId, updates) {
        const objectId = toObjectId(userId);
        if (!objectId) return null;

        const payload = await this._prepareUpdatePayload(updates);
        payload.updatedAt = new Date();

        // Encrypt hashword if present in payload
        if (payload.hashword) {
            payload.hashword = await this._encryptHashword(payload.hashword);
        }

        await updateOne(
            this.prisma,
            'User',
            { _id: objectId, type: 'INDIVIDUAL' },
            { $set: payload }
        );

        const updated = await findOne(this.prisma, 'User', { _id: objectId });
        const decrypted = await this._decryptHashword(updated);
        return this._mapUser(decrypted);
    }

    async updateOrganizationUser(userId, updates) {
        const objectId = toObjectId(userId);
        if (!objectId) return null;

        const payload = { ...updates, updatedAt: new Date() };

        await updateOne(
            this.prisma,
            'User',
            { _id: objectId, type: 'ORGANIZATION' },
            { $set: payload }
        );

        const updated = await findOne(this.prisma, 'User', { _id: objectId });
        const decrypted = await this._decryptHashword(updated);
        return this._mapUser(decrypted);
    }

    async deleteUser(userId) {
        const objectId = toObjectId(userId);
        if (!objectId) return false;

        const result = await deleteOne(this.prisma, 'User', { _id: objectId });
        const deleted = result?.n ?? 0;
        return deleted > 0;
    }

    _mapUser(doc) {
        if (!doc) {
            console.warn('[UserRepositoryDocumentDB] _mapUser received null/undefined document');
            return null;
        }

        // Use optional chaining for robustness
        return {
            id: fromObjectId(doc?._id),
            type: doc?.type ?? null,
            email: doc?.email ?? null,
            username: doc?.username ?? null,
            hashword: doc?.hashword ?? null,
            appUserId: doc?.appUserId ?? null,
            organizationId: doc?.organizationId ? fromObjectId(doc.organizationId) : null,
            appOrgId: doc?.appOrgId ?? null,
            name: doc?.name ?? null,
            createdAt: doc?.createdAt ? new Date(doc.createdAt) : undefined,
            updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : undefined,
        };
    }

    async _prepareUpdatePayload(updates = {}) {
        const payload = { ...updates };

        if (
            payload.hashword !== undefined &&
            payload.hashword !== null &&
            payload.hashword !== ''
        ) {
            if (typeof payload.hashword !== 'string') {
                throw new Error('Password must be a string');
            }

            if (payload.hashword.startsWith('$2')) {
                throw new Error(
                    'Password appears to be already hashed. Pass plain text password only.'
                );
            }

            payload.hashword = await bcrypt.hash(payload.hashword, 10);
        }

        if (payload.organization !== undefined) {
            payload.organizationId = toObjectId(payload.organization);
            delete payload.organization;
        }

        if (payload.organizationId !== undefined) {
            payload.organizationId = payload.organizationId
                ? toObjectId(payload.organizationId)
                : null;
        }

        return payload;
    }
}

module.exports = { UserRepositoryDocumentDB };

