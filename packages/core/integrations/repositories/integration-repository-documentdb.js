const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    toObjectIdArray,
    fromObjectId,
    findMany,
    findManyDrained,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const {
    IntegrationRepositoryInterface,
} = require('./integration-repository-interface');
const { validateConfigPatch } = require('./config-patch-shared');

class IntegrationRepositoryDocumentDB extends IntegrationRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsByUserId(userId) {
        const objectId = toObjectId(userId);
        const filter = objectId ? { userId: objectId } : {};
        const records = await findMany(this.prisma, 'Integration', filter);
        return records.map((doc) => this._mapIntegration(doc));
    }

    async findIntegrations({ type, status } = {}) {
        const filter = {};
        if (type) {
            filter['config.type'] = type;
        }
        if (status) {
            filter.status = status;
        }
        const records = await findMany(this.prisma, 'Integration', filter);
        return records.map((doc) => this._mapIntegration(doc));
    }

    async findIntegrationsByEntityId(entityId) {
        const objectId = toObjectId(entityId);
        if (!objectId) return [];
        const records = await findMany(this.prisma, 'Integration', {
            entityIds: objectId,
        });
        return records.map((doc) => this._mapIntegration(doc));
    }

    async deleteIntegrationById(integrationId) {
        const objectId = toObjectId(integrationId);
        if (!objectId) return { acknowledged: true, deletedCount: 0 };
        const result = await deleteOne(this.prisma, 'Integration', { _id: objectId });
        const deleted = result?.n ?? 0;
        return { acknowledged: true, deletedCount: deleted };
    }

    async findIntegrationByName(name) {
        const doc = await findOne(this.prisma, 'Integration', { 'config.type': name });
        if (!doc) {
            throw new Error(`Integration with name ${name} not found`);
        }
        return this._mapIntegration(doc);
    }

    async findIntegrationById(id) {
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

    async updateIntegrationStatus(integrationId, status) {
        const objectId = toObjectId(integrationId);
        if (!objectId) return false;
        await updateOne(
            this.prisma,
            'Integration',
            { _id: objectId },
            {
                $set: { status, updatedAt: new Date() },
            }
        );
        return true;
    }

    async updateIntegrationMessages(
        integrationId,
        messageType,
        messageTitle,
        messageBody,
        messageTimestamp
    ) {
        const objectId = toObjectId(integrationId);
        if (!objectId) {
            throw new Error(`Integration ${integrationId} not found`);
        }
        const existing = await findOne(this.prisma, 'Integration', { _id: objectId });
        if (!existing) {
            throw new Error(`Integration ${integrationId} not found`);
        }
        const messages = this._extractMessages(existing);
        const list = Array.isArray(messages[messageType]) ? [...messages[messageType]] : [];
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

    async createIntegration(entities, userId, config) {
        const now = new Date();
        const document = {
            userId: toObjectId(userId) || null,
            config,
            version: '0.0.0',
            status: 'IN_CREATION',
            entityIds: toObjectIdArray(entities),
            messages: { errors: [], warnings: [], info: [], logs: [] },
            errors: [],
            warnings: [],
            info: [],
            logs: [],
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

    async findIntegrationByUserId(userId) {
        const objectId = toObjectId(userId);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Integration', { userId: objectId });
        return doc ? this._mapIntegration(doc) : null;
    }

    async updateIntegrationConfig(integrationId, config) {
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
            {
                $set: {
                    config,
                    updatedAt: new Date(),
                },
            }
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

    /**
     * Atomically merge a patch into the existing config with a per-key
     * $set (config.<k> for each patch key), then re-read to shape the
     * return value — DocumentDB's raw update command doesn't return the
     * post-update document directly.
     *
     * @param {string} integrationId - Integration ID
     * @param {Object} patch - Keys to merge into the existing config
     * @returns {Promise<Object>} Updated integration object
     */
    async patchIntegrationConfig(integrationId, patch) {
        validateConfigPatch(patch);
        const objectId = toObjectId(integrationId);
        if (!objectId) {
            throw new Error(`Integration with id ${integrationId} not found`);
        }

        const $set = { updatedAt: new Date() };
        for (const [key, value] of Object.entries(patch)) {
            $set[`config.${key}`] = value;
        }

        const result = await updateOne(
            this.prisma,
            'Integration',
            { _id: objectId },
            { $set }
        );
        if (result.writeErrors?.length) {
            throw new Error(
                `Failed to patch integration config: ${result.writeErrors[0].errmsg}`
            );
        }
        if (!result.n) {
            throw new Error(`Integration with id ${integrationId} not found`);
        }

        const updated = await findOne(this.prisma, 'Integration', { _id: objectId });
        if (!updated) {
            console.error('[IntegrationRepositoryDocumentDB] Integration not found after update', {
                integrationId: fromObjectId(objectId),
                patch,
            });
            throw new Error(
                'Failed to update integration: Document not found after update. ' +
                'This indicates a database consistency issue.'
            );
        }
        return this._mapIntegration(updated);
    }

    /**
     * Find every integration in a report-shaped projection. Drains the full
     * cursor (see class comment) so a deployment-wide report is never truncated.
     *
     * @param {Object} [filter={}]
     * @param {string} [filter.status] - Integration status
     * @param {string} [filter.userId] - Owning user ID
     * @returns {Promise<Array>} Report-shaped integration rows
     */
    async findAllForReport({ status, userId } = {}) {
        const filter = {};
        if (status) filter.status = status;
        if (userId !== undefined && userId !== null) {
            const objectId = toObjectId(userId);
            // An invalid userId means no matches — must not fall through to an
            // unfiltered query that returns the whole deployment.
            if (!objectId) return [];
            filter.userId = objectId;
        }

        const docs = await findManyDrained(this.prisma, 'Integration', filter);

        return docs.map((doc) => {
            const errors = this._extractReportErrors(doc);
            return {
                id: fromObjectId(doc?._id),
                type: doc?.config?.type ?? null,
                status: doc?.status ?? null,
                userId: fromObjectId(doc?.userId) ?? null,
                version: doc?.version ?? null,
                errorCount: Array.isArray(errors) ? errors.length : 0,
                moduleCount: Array.isArray(doc?.entityIds)
                    ? doc.entityIds.length
                    : 0,
                createdAt: doc?.createdAt ?? null,
                updatedAt: doc?.updatedAt ?? null,
            };
        });
    }

    _extractReportErrors(doc) {
        if (Array.isArray(doc?.errors)) return doc.errors;
        if (Array.isArray(doc?.messages?.errors)) return doc.messages.errors;
        return [];
    }

    _mapIntegration(doc) {
        const messages = this._extractMessages(doc);
        return {
            id: fromObjectId(doc?._id),
            entitiesIds: (doc?.entityIds || []).map((value) => fromObjectId(value)),
            userId: fromObjectId(doc?.userId),
            config: doc?.config ?? null,
            version: doc?.version ?? null,
            status: doc?.status ?? null,
            messages,
            createdAt: doc?.createdAt ?? null,
        };
    }

    _extractMessages(doc) {
        const base = doc?.messages && typeof doc.messages === 'object' ? doc.messages : {};
        return {
            errors: base.errors ?? doc?.errors ?? [],
            warnings: base.warnings ?? doc?.warnings ?? [],
            info: base.info ?? doc?.info ?? [],
            logs: base.logs ?? doc?.logs ?? [],
        };
    }
}

module.exports = { IntegrationRepositoryDocumentDB };


