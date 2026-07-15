const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findManyDrained,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const {
    CredentialRepositoryInterface,
} = require('./credential-repository-interface');
const { tallyActiveCredentialsByType } = require('./credential-active-type');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');

/**
 * Credential repository for DocumentDB.
 * Uses DocumentDBEncryptionService for field-level encryption.
 *
 * Encrypted fields:
 * - Credential.data.access_token
 * - Credential.data.refresh_token
 * - Credential.data.id_token
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

        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            doc
        );
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
        const result = await deleteOne(this.prisma, 'Credential', {
            _id: objectId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async upsertCredential(credentialDetails) {
        const { identifiers, details } = credentialDetails;
        if (!identifiers)
            throw new Error('identifiers required to upsert credential');
        if (!identifiers.userId) {
            throw new Error('userId required in identifiers');
        }
        if (!identifiers.externalId) {
            throw new Error(
                'externalId required in identifiers to prevent credential collision. When multiple credentials exist for the same user, both userId and externalId are needed to uniquely identify which credential to update.'
            );
        }

        const filter = this._buildIdentifierFilter(identifiers);
        const existing = await findOne(this.prisma, 'Credential', filter);
        const now = new Date();

        const { authIsValid, ...oauthData } = details || {};

        if (existing) {
            const decryptedExisting =
                await this.encryptionService.decryptFields(
                    'Credential',
                    existing
                );
            const mergedData = {
                ...(decryptedExisting.data || {}),
                ...oauthData,
            };

            const updateDocument = {
                userId: existing.userId,
                externalId: existing.externalId,
                authIsValid: authIsValid !== undefined ? authIsValid : existing.authIsValid,
                data: mergedData,
                updatedAt: now,
            };

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

            const updated = await findOne(this.prisma, 'Credential', {
                _id: existing._id,
            });
            const decryptedCredential =
                await this.encryptionService.decryptFields(
                    'Credential',
                    updated
                );
            return this._mapCredential(decryptedCredential);
        }

        const plainDocument = {
            userId: toObjectId(identifiers.userId),
            externalId: identifiers.externalId,
            authIsValid: details.authIsValid,
            data: { ...oauthData },
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields(
            'Credential',
            plainDocument
        );

        const insertedId = await insertOne(
            this.prisma,
            'Credential',
            encryptedDocument
        );

        const created = await findOne(this.prisma, 'Credential', {
            _id: insertedId,
        });
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            created
        );
        return this._mapCredential(decryptedCredential);
    }

    async findCredential(filter) {
        const query = this._buildFilter(filter);
        const credential = await findOne(this.prisma, 'Credential', query);
        if (!credential) return null;

        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            credential
        );
        return this._mapCredential(decryptedCredential);
    }

    async updateCredential(credentialId, updates) {
        const objectId = toObjectId(credentialId);
        if (!objectId) return null;
        const existing = await findOne(this.prisma, 'Credential', {
            _id: objectId,
        });
        if (!existing) return null;

        const { authIsValid, ...oauthData } = updates || {};

        const decryptedExisting = await this.encryptionService.decryptFields(
            'Credential',
            existing
        );
        const mergedData = { ...(decryptedExisting.data || {}), ...oauthData };

        const updateDocument = {
            userId: existing.userId,
            externalId: existing.externalId,
            authIsValid: authIsValid,
            data: mergedData,
            updatedAt: new Date(),
        };

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

        const updated = await findOne(this.prisma, 'Credential', {
            _id: objectId,
        });
        const decryptedCredential = await this.encryptionService.decryptFields(
            'Credential',
            updated
        );
        return this._mapCredential(decryptedCredential);
    }

    /**
     * Count credentials active since a timestamp, grouped by integration type.
     *
     * Two projected raw reads, no decryption: the encrypted `data` JSON is
     * never fetched, so `encryptionService.decryptFields` is not invoked.
     * Integration type is derived from the related Entity.moduleName.
     *
     * @param {Object} params
     * @param {Date} [params.since] - Lower bound on updatedAt
     * @returns {Promise<Array<{ integrationType: string, count: number }>>}
     */
    async countActiveByType({ since } = {}) {
        const filter = {};
        // Coerce to a Date so an HTTP-sourced string is not passed raw into the
        // $gte filter (BSON date vs string type-bracketing would never match).
        if (since) filter.updatedAt = { $gte: new Date(since) };

        // Drained: a deployment-wide credential scan must not truncate at the
        // ~101-doc first batch (mirrors the integration/mapping report reads).
        const activeCredentials = await findManyDrained(
            this.prisma,
            'Credential',
            filter,
            { projection: { _id: 1 } }
        );

        const credentialIds = activeCredentials
            .map((doc) => toObjectId(doc._id))
            .filter(Boolean);

        const entities = credentialIds.length
            ? await findManyDrained(
                  this.prisma,
                  'Entity',
                  { credentialId: { $in: credentialIds } },
                  { projection: { credentialId: 1, moduleName: 1 } }
              )
            : [];

        const entitiesByCredential = new Map();
        for (const entity of entities) {
            const key = fromObjectId(entity.credentialId);
            if (!entitiesByCredential.has(key)) {
                entitiesByCredential.set(key, []);
            }
            entitiesByCredential
                .get(key)
                .push({ moduleName: entity.moduleName });
        }

        const credentials = activeCredentials.map((doc) => ({
            entities: entitiesByCredential.get(fromObjectId(doc._id)) || [],
        }));

        return tallyActiveCredentialsByType(credentials);
    }

    _buildIdentifierFilter(identifiers) {
        const filter = {};
        if (identifiers._id || identifiers.id) {
            const idObj = toObjectId(identifiers._id || identifiers.id);
            if (idObj) filter._id = idObj;
        }
        if (identifiers.userId) {
            filter.userId = toObjectId(identifiers.userId);
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
        if (filter.userId !== undefined) {
            query.userId = filter.userId;
        }
        if (filter.externalId !== undefined) {
            query.externalId = filter.externalId;
        }
        return query;
    }

    /**
     * Map credential document to application format
     * Matches MongoDB repository format
     * @private
     */
    _mapCredential(doc) {
        const data = doc?.data || {};
        const id = fromObjectId(doc?._id);
        const userId = doc?.userId;
        return {
            id,
            userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }

    _mapCredentialById(doc) {
        const data = doc?.data || {};
        const id = fromObjectId(doc?._id);
        const userId = doc?.userId;
        return {
            id,
            userId,
            externalId: doc?.externalId ?? null,
            authIsValid: doc?.authIsValid ?? null,
            ...data,
        };
    }
}

module.exports = { CredentialRepositoryDocumentDB };
