const { prisma } = require('../../database/prisma');
const { toObjectId, fromObjectId } = require('../../database/documentdb-utils');
const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

const DRAIN_BATCH_SIZE = 1000;
const MAX_BATCHES = 100000;

// Drains cursors via getMore rather than reusing documentdb-utils.findMany/
// aggregate, which return only the first batch (~101 docs) and would silently
// truncate a deployment-wide report.
class ReportingRepositoryDocumentDB extends ReportingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsForReport({ status, userId } = {}) {
        const filter = {};
        if (status) filter.status = status;
        if (userId !== undefined && userId !== null) {
            const objectId = toObjectId(userId);
            // An invalid userId means no matches — must not fall through to an
            // unfiltered query that returns the whole deployment.
            if (!objectId) return [];
            filter.userId = objectId;
        }

        const docs = await this._findDrained('Integration', filter);

        return docs.map((doc) => {
            const errors = this._extractErrors(doc);
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

    async countMappingsByIntegrationIds(ids = []) {
        const counts = new Map();
        if (!ids || ids.length === 0) return counts;

        // IntegrationMapping.integrationId is stored as a string in DocumentDB,
        // so match by string — an ObjectId $in would never match (always 0).
        const stringIds = ids.map(String);

        const rows = await this._aggregateDrained('IntegrationMapping', [
            { $match: { integrationId: { $in: stringIds } } },
            { $group: { _id: '$integrationId', count: { $sum: 1 } } },
        ]);

        for (const row of rows) {
            counts.set(String(row?._id), row?.count ?? 0);
        }
        return counts;
    }

    async _findDrained(collection, filter) {
        const first = await this.prisma.$runCommandRaw({
            find: collection,
            filter,
            batchSize: DRAIN_BATCH_SIZE,
        });
        return this._drain(collection, first);
    }

    async _aggregateDrained(collection, pipeline) {
        const first = await this.prisma.$runCommandRaw({
            aggregate: collection,
            pipeline,
            cursor: { batchSize: DRAIN_BATCH_SIZE },
        });
        return this._drain(collection, first);
    }

    async _drain(collection, firstResult) {
        const cursor = firstResult?.cursor || {};
        const docs = [...(cursor.firstBatch || [])];
        let cursorId = cursor.id;
        let batches = 0;

        while (this._cursorOpen(cursorId) && batches < MAX_BATCHES) {
            batches += 1;
            const next = await this.prisma.$runCommandRaw({
                getMore: cursorId,
                collection,
                batchSize: DRAIN_BATCH_SIZE,
            });
            const nextCursor = next?.cursor || {};
            const nextBatch = nextCursor.nextBatch || [];
            docs.push(...nextBatch);
            cursorId = nextCursor.id;
            if (nextBatch.length === 0) break;
        }
        return docs;
    }

    _cursorOpen(id) {
        if (id === undefined || id === null) return false;
        if (typeof id === 'number') return id !== 0;
        if (typeof id === 'bigint') return id !== 0n;
        // Extended JSON can surface a 64-bit cursor id as { $numberLong: "..." }.
        if (typeof id === 'object' && id.$numberLong !== undefined) {
            return id.$numberLong !== '0';
        }
        return String(id) !== '0';
    }

    _extractErrors(doc) {
        if (Array.isArray(doc?.errors)) return doc.errors;
        if (Array.isArray(doc?.messages?.errors)) return doc.messages.errors;
        return [];
    }
}

module.exports = { ReportingRepositoryDocumentDB };
