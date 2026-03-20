import { IntegrationMappingRepositoryInterface } from './integration-mapping-repository-interface';
import type { IntegrationMappingRecord, DeletionResult } from '../types';

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
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');

export class IntegrationMappingRepositoryDocumentDB extends IntegrationMappingRepositoryInterface {
    private prisma: any;
    private readonly encryptionService: any;

    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async findMappingBy(integrationId: string, sourceId: string): Promise<IntegrationMappingRecord | null> {
        const filter = this._compositeFilter(integrationId, sourceId);
        const doc = await findOne(this.prisma, 'IntegrationMapping', filter);
        if (!doc) return null;

        const decryptedMapping = await this.encryptionService.decryptFields(
            'IntegrationMapping',
            doc
        );
        return this._mapMapping(decryptedMapping);
    }

    async upsertMapping(integrationId: string, sourceId: string, mapping: unknown): Promise<IntegrationMappingRecord> {
        const filter = this._compositeFilter(integrationId, sourceId);
        const existing = await findOne(this.prisma, 'IntegrationMapping', filter);
        const now = new Date();

        if (existing) {
            await this.encryptionService.decryptFields('IntegrationMapping', existing);

            const updateDocument = { mapping, updatedAt: now };
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: updateDocument.mapping }
            );

            await updateOne(
                this.prisma,
                'IntegrationMapping',
                { _id: existing._id },
                { $set: { mapping: encryptedUpdate.mapping, updatedAt: updateDocument.updatedAt } }
            );

            const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: existing._id });
            if (!updated) {
                console.error(
                    '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
                    { mappingId: fromObjectId(existing._id), integrationId, sourceId }
                );
                throw new Error(
                    'Failed to update mapping: Document not found after update. ' +
                    'This indicates a database consistency issue.'
                );
            }
            const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', updated);
            return this._mapMapping(decryptedMapping);
        }

        const plainDocument = {
            integrationId,
            sourceId: sourceId === null || sourceId === undefined ? null : String(sourceId),
            mapping,
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields('IntegrationMapping', plainDocument);
        const insertedId = await insertOne(this.prisma, 'IntegrationMapping', encryptedDocument);

        const created = await findOne(this.prisma, 'IntegrationMapping', { _id: insertedId });
        if (!created) {
            console.error(
                '[IntegrationMappingRepositoryDocumentDB] Mapping not found after insert',
                { insertedId: fromObjectId(insertedId), integrationId, sourceId }
            );
            throw new Error(
                'Failed to create mapping: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', created);
        return this._mapMapping(decryptedMapping);
    }

    async findMappingsByIntegration(integrationId: string): Promise<IntegrationMappingRecord[]> {
        const filter: any = {};
        if (integrationId) filter.integrationId = integrationId;
        const docs = await findMany(this.prisma, 'IntegrationMapping', filter);

        const decryptedDocs = await Promise.all(
            docs.map((doc: any) =>
                this.encryptionService.decryptFields('IntegrationMapping', doc)
            )
        );
        return decryptedDocs.map((doc: any) => this._mapMapping(doc));
    }

    async deleteMapping(integrationId: string, sourceId: string): Promise<DeletionResult> {
        const filter = this._compositeFilter(integrationId, sourceId);
        const result = await deleteOne(this.prisma, 'IntegrationMapping', filter);
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async deleteMappingsByIntegration(integrationId: string): Promise<DeletionResult> {
        if (!integrationId) {
            return { acknowledged: true, deletedCount: 0 };
        }
        const result = await deleteMany(this.prisma, 'IntegrationMapping', { integrationId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findMappingById(id: string): Promise<IntegrationMappingRecord | null> {
        const objectId = toObjectId(id);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!doc) return null;

        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', doc);
        return this._mapMapping(decryptedMapping);
    }

    async updateMapping(id: string, updates: Partial<IntegrationMappingRecord>): Promise<IntegrationMappingRecord> {
        const objectId = toObjectId(id);
        if (!objectId) return null as any;

        const existing = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!existing) return null as any;

        const decryptedExisting = await this.encryptionService.decryptFields('IntegrationMapping', existing);
        const mergedMapping = (updates as any).mapping !== undefined
            ? (updates as any).mapping
            : decryptedExisting.mapping;

        const updateDocument: any = { ...updates, updatedAt: new Date() };

        if (mergedMapping !== undefined) {
            const encryptedUpdate = await this.encryptionService.encryptFields(
                'IntegrationMapping',
                { mapping: mergedMapping }
            );
            updateDocument.mapping = encryptedUpdate.mapping;
        }

        await updateOne(this.prisma, 'IntegrationMapping', { _id: objectId }, { $set: updateDocument });

        const updated = await findOne(this.prisma, 'IntegrationMapping', { _id: objectId });
        if (!updated) {
            console.error(
                '[IntegrationMappingRepositoryDocumentDB] Mapping not found after update',
                { mappingId: fromObjectId(objectId) }
            );
            throw new Error(
                'Failed to update mapping: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }
        const decryptedMapping = await this.encryptionService.decryptFields('IntegrationMapping', updated);
        return this._mapMapping(decryptedMapping);
    }

    private _compositeFilter(integrationId: string, sourceId: string): Record<string, unknown> {
        const filter: Record<string, unknown> = {};
        if (integrationId) filter.integrationId = integrationId;
        if (sourceId !== undefined) {
            filter.sourceId = sourceId === null ? null : String(sourceId);
        }
        return filter;
    }

    private _mapMapping(doc: any): IntegrationMappingRecord {
        return {
            id: fromObjectId(doc?._id),
            integrationId: doc?.integrationId ?? null,
            sourceId: doc?.sourceId ?? null,
            mapping: doc?.mapping ?? null,
            createdAt: doc?.createdAt,
            updatedAt: doc?.updatedAt,
        };
    }
}
