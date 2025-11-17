const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
    deleteMany,
} = require('../../database/documentdb-utils');
const {
    IntegrationMappingRepositoryInterface,
} = require('./integration-mapping-repository-interface');
const { DocumentDBEncryptionService } = require('../../database/documentdb-encryption-service');

/**
 * IntegrationMapping repository for DocumentDB.
 * Uses DocumentDBEncryptionService for field-level encryption.
 *
 * Encrypted fields:
 * - IntegrationMapping.mapping
 *
 * SECURITY CRITICAL: Mapping data may contain API keys, secrets, and sensitive configuration.
 *
 * DEFENSIVE CHECK PATTERN:
 * Methods that return documents (upsertMapping, updateMapping) include defensive checks
 * to verify the document exists after write operations. This catches:
 * - Race conditions (document deleted between write and read)
 * - Silent write failures due to permissions or storage issues
 * - DocumentDB replication consistency issues
 *
 * @see credential-repository-documentdb.js for the same pattern
 * @see DocumentDBEncryptionService
 * @see encryption-schema-registry.js
 */
class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async findMappingBy(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const doc = await findOne(this.prisma, 'IntegrationMapping', filter);
        if (!doc) return null;

        // Decrypt sensitive fields using service
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', doc);
        return this._mapMapping(decryptedMapping);
    }

    async upsertMapping(integrationId, sourceId, mapping) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const existing = await findOne(this.prisma, 'IntegrationMapping', filter);
        const now = new Date();

        if (existing) {
            // Decrypt existing mapping data first
            const decryptedExisting = await this.encryptionService.decryptFields('IntegrationMapping', existing);

            // Build update document
            const updateDocument = {
                mapping,  // Plain text mapping
                updatedAt: now,
            };

            // Encrypt before storing
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: updateDocument.mapping }
            );

            await updateOne(
                this.prisma,
                'IntegrationMapping',
                { _id: existing._id },
                {
                    $set: {
                        mapping: encryptedUpdate.mapping,
                        updatedAt: updateDocument.updatedAt,
                    },
                }
            );

            // Read back and decrypt
            const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: existing._id });
            if (!updated) {
                console.error('[IntegrationMappingRepositoryDocumentDB] Mapping not found after update', {
                    mappingId: fromObjectId(existing._id),
                    integrationId,
                    sourceId,
                });
                throw new Error(
                    'Failed to update mapping: Document not found after update. ' +
                    'This indicates a database consistency issue.'
                );
            }
            const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', updated);
            return this._mapMapping(decryptedMapping);
        }

        // Build plain text document
        const plainDocument = {
            integrationId: toObjectId(integrationId),
            sourceId: sourceId === null || sourceId === undefined ? null : String(sourceId),
            mapping,
            createdAt: now,
            updatedAt: now,
        };

        // Encrypt before storing
        const encryptedDocument = await this.encryptionService.encryptFields(
            'IntegrationMapping',
            plainDocument
        );

        const insertedId = await insertOne(this.prisma, 'IntegrationMapping', encryptedDocument);

        // Read back and decrypt
        const created = await findOne(this.prisma, 'IntegrationMapping', { _id: insertedId });
        if (!created) {
            console.error('[IntegrationMappingRepositoryDocumentDB] Mapping not found after insert', {
                insertedId: fromObjectId(insertedId),
                integrationId,
                sourceId,
            });
            throw new Error(
                'Failed to create mapping: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', created);
        return this._mapMapping(decryptedMapping);
    }

    async findMappingsByIntegration(integrationId) {
        const filter = {};
        const integrationObjectId = toObjectId(integrationId);
        if (integrationObjectId) filter.integrationId = integrationObjectId;
        const docs = await findMany(this.prisma, 'IntegrationMapping', filter);

        // Decrypt sensitive fields for each document
        const decryptedDocs = await Promise.all(
            docs.map(doc => this.encryptionService.decryptFields('IntegrationMapping', doc))
        );

        return decryptedDocs.map((doc) => this._mapMapping(doc));
    }

    async deleteMapping(integrationId, sourceId) {
        const filter = this._compositeFilter(integrationId, sourceId);
        const result = await deleteOne(this.prisma, 'IntegrationMapping', filter);
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteMappingsByIntegration(integrationId) {
        const integrationObjectId = toObjectId(integrationId);
        if (!integrationObjectId) {
            return { acknowledged: true, deletedCount: 0 };
        }
        const result = await deleteMany(this.prisma, 'IntegrationMapping', {
            integrationId: integrationObjectId,
        });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findMappingById(id) {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!doc) return null;

        // Decrypt sensitive fields using service
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', doc);
        return this._mapMapping(decryptedMapping);
    }

    async updateMapping(id, updates) {
        const objectId = toObjectId(id);
        if (!objectId) return null;

        const existing = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!existing) return null;

        // Decrypt existing mapping data first
        const decryptedExisting = await this.encryptionService.decryptFields('IntegrationMapping', existing);

        // Merge updates - if mapping is provided, use it, otherwise keep existing
        const mergedMapping = updates.mapping !== undefined ? updates.mapping : decryptedExisting.mapping;

        // Build update with other fields
        const updateDocument = {
            ...updates,
            updatedAt: new Date(),
        };

        // Encrypt mapping before storing
        if (mergedMapping !== undefined) {
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: mergedMapping }
            );
            updateDocument.mapping = encryptedUpdate.mapping;
        }

        await updateOne(
            this.prisma,
            'IntegrationMapping',
            { _id: objectId },
            {
                $set: updateDocument,
            }
        );

        // Read back and decrypt
        const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!updated) {
            console.error('[IntegrationMappingRepositoryDocumentDB] Mapping not found after update', {
                mappingId: fromObjectId(objectId),
            });
            throw new Error(
                'Failed to update mapping: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', updated);
        return this._mapMapping(decryptedMapping);
    }

    _compositeFilter(integrationId, sourceId) {
        const filter = {};
        const integrationObjectId = toObjectId(integrationId);
        if (integrationObjectId) filter.integrationId = integrationObjectId;
        if (sourceId !== undefined) {
            filter.sourceId = sourceId === null ? null : String(sourceId);
        }
        return filter;
    }

    _mapMapping(doc) {
        return {
            id: fromObjectId(doc?._id),
            integrationId: fromObjectId(doc?.integrationId),
            sourceId: doc?.sourceId ?? null,
            mapping: doc?.mapping ?? null,
            createdAt: doc?.createdAt,
            updatedAt: doc?.updatedAt,
        };
    }
}

module.exports = { IntegrationMappingRepositoryDocumentDB };


