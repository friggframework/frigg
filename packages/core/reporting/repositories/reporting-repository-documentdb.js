const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    aggregate,
} = require('../../database/documentdb-utils');
const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

/**
 * DocumentDB Reporting Repository Adapter
 *
 * DocumentDB has no Prisma `groupBy`/`include`, so it uses raw `$runCommandRaw`
 * helpers: a filtered `find` for the integration list (module count comes from
 * the `entityIds` array on the document) and a `$group` aggregation for mapping
 * counts. No encrypted field (`mapping`/`data`) is read.
 */
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
            if (objectId) filter.userId = objectId;
        }

        const docs = await findMany(this.prisma, 'Integration', filter);

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

        const objectIds = ids.map((id) => toObjectId(id)).filter(Boolean);
        if (objectIds.length === 0) return counts;

        const rows = await aggregate(this.prisma, 'IntegrationMapping', [
            { $match: { integrationId: { $in: objectIds } } },
            { $group: { _id: '$integrationId', count: { $sum: 1 } } },
        ]);

        for (const row of rows) {
            counts.set(fromObjectId(row?._id), row?.count ?? 0);
        }
        return counts;
    }

    _extractErrors(doc) {
        if (Array.isArray(doc?.errors)) return doc.errors;
        if (Array.isArray(doc?.messages?.errors)) return doc.messages.errors;
        return [];
    }
}

module.exports = { ReportingRepositoryDocumentDB };
