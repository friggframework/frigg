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
const { DocumentDBEncryptionService } = require('../../database/documentdb-encryption-service');

/**
 * User repository for DocumentDB.
 * Uses DocumentDBEncryptionService for field-level encryption.
 *
 * Encrypted fields: User.hashword
 *
 * @see DocumentDBEncryptionService
 * @see encryption-schema-registry.js
 */
class UserRepositoryDocumentDB extends UserRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.tokenRepository = createTokenRepository();
        this.encryptionService = new DocumentDBEncryptionService();
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
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserById(userId) {
        const doc = await findOne(this.prisma, 'User', {
            _id: toObjectId(userId),
            type: 'INDIVIDUAL',
        });
        const decrypted = await this.encryptionService.decryptFields('User', doc);
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
            document.hashword = await bcrypt.hash(params.hashword, 10);
        }

        // Encrypt sensitive fields before insert
        const encryptedDocument = await this.encryptionService.encryptFields('User', document);
        const insertedId = await insertOne(this.prisma, 'User', encryptedDocument);
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

        // Decrypt sensitive fields after read
        const decrypted = await this.encryptionService.decryptFields('User', created);

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
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByAppUserId(appUserId) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'INDIVIDUAL',
            appUserId,
        });
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findOrganizationUserByAppOrgId(appOrgId) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'ORGANIZATION',
            appOrgId,
        });
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findUserById(userId) {
        const doc = await findOne(this.prisma, 'User', { _id: toObjectId(userId) });
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async findIndividualUserByEmail(email) {
        const doc = await findOne(this.prisma, 'User', {
            type: 'INDIVIDUAL',
            email,
        });
        const decrypted = await this.encryptionService.decryptFields('User', doc);
        return this._mapUser(decrypted);
    }

    async updateIndividualUser(userId, updates) {
        const objectId = toObjectId(userId);
        if (!objectId) return null;

        const payload = await this._prepareUpdatePayload(updates);
        payload.updatedAt = new Date();

        // Encrypt sensitive fields before update
        const encryptedPayload = await this.encryptionService.encryptFields('User', payload);

        await updateOne(
            this.prisma,
            'User',
            { _id: objectId, type: 'INDIVIDUAL' },
            { $set: encryptedPayload }
        );

        const updated = await findOne(this.prisma, 'User', { _id: objectId });
        const decrypted = await this.encryptionService.decryptFields('User', updated);
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
        const decrypted = await this.encryptionService.decryptFields('User', updated);
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

