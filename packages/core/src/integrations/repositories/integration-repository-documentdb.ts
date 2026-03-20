import { IntegrationRepositoryInterface } from './integration-repository-interface';
import type { IntegrationRecord, IntegrationConfig, IntegrationMessages, DeletionResult } from '../types';

const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    toObjectIdArray,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');

export class IntegrationRepositoryDocumentDB extends IntegrationRepositoryInterface {
    private readonly prisma: any;

    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsByUserId(userId: string): Promise<IntegrationRecord[]> {
        const objectId = toObjectId(userId);
        const filter = objectId ? { userId: objectId } : {};
        const records = await findMany(this.prisma, 'Integration', filter);
        return records.map((doc: any) => this._mapIntegration(doc));
    }

    async deleteIntegrationById(integrationId: string): Promise<DeletionResult> {
        const objectId = toObjectId(integrationId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Integration', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findIntegrationByName(name: string): Promise<IntegrationRecord> {
        const doc = await findOne(this.prisma, 'Integration', { 'config.type': name });
        if (!doc) {
            throw new Error(`Integration with name ${name} not found`);
        }
        return this._mapIntegration(doc);
    }

    async findIntegrationById(id: string): Promise<IntegrationRecord> {
        const objectId = toObjectId(id);
        if (!objectId) {
            throw new Error(`Integration with id ${id} not found`);
        }
        const doc = await findOne(this.prisma, 'Integration', { _id: objectId });
        if (!doc) {
            throw new Error(`Integration with id ${id} not found`);
        }
        return this._mapIntegration(doc);
    }

    async updateIntegrationStatus(integrationId: string, status: string): Promise<boolean> {
        const objectId = toObjectId(integrationId);
        if (!objectId) return false;
        await updateOne(
            this.prisma,
            'Integration',
            { _id: objectId },
            { $set: { status, updatedAt: new Date() } }
        );
        return true;
    }

    async updateIntegrationMessages(
        integrationId: string,
        messageType: string,
        messageTitle: string,
        messageBody: string,
        messageTimestamp: number | Date
    ): Promise<boolean> {
        const objectId = toObjectId(integrationId);
        if (!objectId) {
            throw new Error(`Integration ${integrationId} not found`);
        }
        const existing = await findOne(this.prisma, 'Integration', { _id: objectId });
        if (!existing) {
            throw new Error(`Integration ${integrationId} not found`);
        }
        const messages = this._extractMessages(existing);
        const list = Array.isArray(messages[messageType]) ? [...messages[messageType]!] : [];
        list.push({
            title: messageTitle ?? null,
            message: messageBody,
            timestamp: messageTimestamp,
        });
        const updatedMessages = { ...messages, [messageType]: list };
        await updateOne(
            this.prisma,
            'Integration',
            { _id: objectId },
            {
                $set: {
                    messages: updatedMessages,
                    errors: updatedMessages.errors ?? [],
                    warnings: updatedMessages.warnings ?? [],
                    info: updatedMessages.info ?? [],
                    logs: updatedMessages.logs ?? [],
                    updatedAt: new Date(),
                },
            }
        );
        return true;
    }

    async createIntegration(entities: string[], userId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        const now = new Date();
        const document = {
            userId: toObjectId(userId) || null,
            config,
            version: '0.0.0',
            status: 'ENABLED',
            entityIds: toObjectIdArray(entities),
            messages: { errors: [], warnings: [], info: [], logs: [] },
            errors: [] as unknown[],
            warnings: [] as unknown[],
            info: [] as unknown[],
            logs: [] as unknown[],
            createdAt: now,
            updatedAt: now,
        };
        const insertedId = await insertOne(this.prisma, 'Integration', document);
        const created = await findOne(this.prisma, 'Integration', { _id: insertedId });
        if (!created) {
            console.error('[IntegrationRepositoryDocumentDB] Integration not found after insert', {
                insertedId: fromObjectId(insertedId),
                userId,
                config,
            });
            throw new Error(
                'Failed to create integration: Document not found after insert. ' +
                'This indicates a database consistency issue.'
            );
        }
        return this._mapIntegration(created);
    }

    async findIntegrationByUserId(userId: string): Promise<IntegrationRecord | null> {
        const objectId = toObjectId(userId);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Integration', { userId: objectId });
        return doc ? this._mapIntegration(doc) : null;
    }

    async updateIntegrationConfig(integrationId: string, config: IntegrationConfig): Promise<IntegrationRecord> {
        if (config === null || config === undefined) {
            throw new Error('Config parameter is required');
        }
        const objectId = toObjectId(integrationId);
        if (!objectId) {
            throw new Error(`Integration with id ${integrationId} not found`);
        }
        await updateOne(
            this.prisma,
            'Integration',
            { _id: objectId },
            { $set: { config, updatedAt: new Date() } }
        );
        const updated = await findOne(this.prisma, 'Integration', { _id: objectId });
        if (!updated) {
            console.error('[IntegrationRepositoryDocumentDB] Integration not found after update', {
                integrationId: fromObjectId(objectId),
                config,
            });
            throw new Error(
                'Failed to update integration: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }
        return this._mapIntegration(updated);
    }

    private _mapIntegration(doc: any): IntegrationRecord {
        const messages = this._extractMessages(doc);
        return {
            id: fromObjectId(doc?._id),
            entitiesIds: (doc?.entityIds || []).map((value: any) => fromObjectId(value)),
            userId: fromObjectId(doc?.userId),
            config: doc?.config ?? null,
            version: doc?.version ?? null,
            status: doc?.status ?? null,
            messages,
        };
    }

    private _extractMessages(doc: any): IntegrationMessages {
        const base = doc?.messages && typeof doc.messages === 'object' ? doc.messages : {};
        return {
            errors: base.errors ?? doc?.errors ?? [],
            warnings: base.warnings ?? doc?.warnings ?? [],
            info: base.info ?? doc?.info ?? [],
            logs: base.logs ?? doc?.logs ?? [],
        };
    }
}
