const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const {
    CredentialRepositoryInterface,
} = require('./credential-repository-interface');
const { DocumentDBEncryptionService } = require('../../database/documentdb-encryption-service');

/**
 * Credential repository for DocumentDB.
 * Uses DocumentDBEncryptionService for field-level encryption.
 *
 * Encrypted fields:
 * - Credential.data.access_token
 * - Credential.data.refresh_token
 * - Credential.data.id_token
 * - Credential.data.domain
 *
 * SECURITY CRITICAL: All OAuth credentials must be encrypted at rest.
 *
 * @see DocumentDBEncryptionService
 * @see encryption-schema-registry.js
 */
class CredentialRepositoryDocumentDB extends CredentialRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async findCredentialById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Credential', { _id: objectId });
        if (!doc) return null;

        // Decrypt sensitive fields using service
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', doc);
        return this._mapCredentialById(decryptedCredential);
    }

    async updateAuthenticationStatus(credentialId, authIsValid) {
        const objectId = toObjectId(credentialId);
        if (!objectId) return { acknowledged: false, modifiedCount: 0 };
        const result = await updateOne(
            this.prisma,
            'Credential',
            { _id: objectId },
            {
                $set: { authIsValid, updatedAt: new Date() },
            }
        );
        const modified = result?.nModified ?? result?.n ?? 0;
        return { acknowledged: true, modifiedCount: modified };
    }

    async deleteCredentialById(credentialId) {
        const objectId = toObjectId(credentialId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Credential', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers) throw new Error('identifiers required to upsert credential');
        if (!identifiers.user && !identifiers.userId) {
            throw new Error('user or userId required in identifiers');
        }
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. When multiple credentials exist for the same user, both userId and externalId are needed to uniquely identify which credential to update.'
            );
        }

        const filter = this._buildIdentifierFilter(identifiers);
        const existing = await findOne(this.prisma, 'Credential', filter);

        const {
            user,
            userId,
            authIsValid,
            externalId,
            ...oauthData
        } = details || {};

        const now = new Date();

        if (existing) {
            // Decrypt existing credential data first
            const decryptedExisting = await this.encryptionService.decryptFields('Credential', existing);
            const mergedData = { ...(decryptedExisting.data || {}), ...oauthData };

            // Build update document
            const updateDocument = {
                userId: toObjectId(userId || user) || existing.userId || null,
                externalId: externalId !== undefined ? externalId : existing.externalId,
                authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                data: mergedData,
                updatedAt: now,
            };

            // Encrypt before storing
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'Credential',
                { data: updateDocument.data }
            );

            await updateOne(
                this.prisma,
                'Credential',
                { _id: existing._id },
                {
                    $set: {
                        userId: updateDocument.userId,
                        externalId: updateDocument.externalId,
                        authIsValid: updateDocument.authIsValid,
                        data: encryptedUpdate.data,
                        updatedAt: updateDocument.updatedAt,
                    },
                }
            );

            // Read back and decrypt
            const updated = await findOne(this.prisma, 'Credential', { _id: existing._id });
            const decryptedCredential = await this.encryptionService.decryptFields('Credential', updated);
            return this._mapCredential(decryptedCredential);
        }

        // Build plain text document
        const plainDocument = {
            userId: toObjectId(userId || user || identifiers.user),
            externalId: externalId !== undefined ? externalId : identifiers.externalId,
            authIsValid: authIsValid ?? null,
            data: oauthData,
            createdAt: now,
            updatedAt: now,
        };

        // Encrypt before storing
        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            plainDocument
        );

        const insertedId = await insertOne(this.prisma, 'Credential', encryptedDocument);

        // Read back and decrypt
        const created = await findOne(this.prisma, 'Credential', { _id: insertedId });
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', created);
        return this._mapCredential(decryptedCredential);
    }

    async findCredential(filter) {
        const query = this._buildFilter(filter);
        const credential = await findOne(this.prisma, 'Credential', query);
        if (!credential) return null;

        // Decrypt sensitive fields using service
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', credential);
        return this._mapCredential(decryptedCredential);
    }

    async updateCredential(credentialId, updates) {
        const objectId = toObjectId(credentialId);
        if (!objectId) return null;
        const existing = await findOne(this.prisma, 'Credential', { _id: objectId });
        if (!existing) return null;

        const {
            user,
            userId,
            authIsValid,
            externalId,
            ...oauthData
        } = updates || {};

        // Decrypt existing credential data first
        const decryptedExisting = await this.encryptionService.decryptFields('Credential', existing);
        const mergedData = { ...(decryptedExisting.data || {}), ...oauthData };

        // Build update document
        const updateDocument = {
            userId: toObjectId(userId || user) || existing.userId || null,
            externalId: externalId !== undefined ? externalId : existing.externalId,
            authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
            data: mergedData,
            updatedAt: new Date(),
        };

        // Encrypt before storing
        const encryptedUpdate = await this.encryptionService.encryptFields(
            'Credential',
            { data: updateDocument.data }
        );

        await updateOne(
            this.prisma,
            'Credential',
            { _id: objectId },
            {
                $set: {
                    userId: updateDocument.userId,
                    externalId: updateDocument.externalId,
                    authIsValid: updateDocument.authIsValid,
                    data: encryptedUpdate.data,
                    updatedAt: updateDocument.updatedAt,
                },
            }
        );

        // Read back and decrypt
        const updated = await findOne(this.prisma, 'Credential', { _id: objectId });
        const decryptedCredential = await this.encryptionService.decryptFields('Credential', updated);
        return this._mapCredential(decryptedCredential);
    }

    _buildIdentifierFilter(identifiers) {
        const filter = {};
        if (identifiers._id || identifiers.id) {
            const idObj = toObjectId(identifiers._id || identifiers.id);
            if (idObj) filter._id = idObj;
        }
        if (identifiers.user || identifiers.userId) {
            const userObj = toObjectId(identifiers.user || identifiers.userId);
            if (userObj) filter.userId = userObj;
        }
        if (identifiers.externalId !== undefined) {
            filter.externalId = identifiers.externalId;
        }
        return filter;
    }

    _buildFilter(filter) {
        const query = {};
        if (!filter) return query;
        if (filter.credentialId || filter.id) {
            const idObj = toObjectId(filter.credentialId || filter.id);
            if (idObj) query._id = idObj;
        }
        if (filter.user || filter.userId) {
            const userObj = toObjectId(filter.user || filter.userId);
            if (userObj) query.userId = userObj;
        }
        if (filter.externalId !== undefined) {
            query.externalId = filter.externalId;
        }
        return query;
    }

    /**
     * Map credential document to application format (without legacy fields)
     * Used by findCredential, upsertCredential, updateCredential
     * Matches MongoDB repository format
     * @private
     */
    _mapCredential(doc) {
        const data = doc?.data || {};
        const id = fromObjectId(doc?._id);
        const userId = fromObjectId(doc?.userId);
        return {
            id,
            userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }

    /**
     * Map credential document with legacy fields for findCredentialById
     * Includes _id and user fields for backward compatibility
     * Matches MongoDB repository format
     * @private
     */
    _mapCredentialById(doc) {
        const data = doc?.data || {};
        const id = fromObjectId(doc?._id);
        const userId = fromObjectId(doc?.userId);
        return {
            _id: id,
            id,
            user: userId,
            userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }
}

module.exports = { CredentialRepositoryDocumentDB };

