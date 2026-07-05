const { prisma } = require('../../database/prisma');
const { UsageRepositoryInterface } = require('./usage-repository-interface');

/**
 * Prisma-backed usage store (ADR-011 §4). This is the canonical implementation;
 * because Prisma abstracts the underlying database, the Mongo and DocumentDB
 * adapters extend this class unchanged (see their files). All queries touch only
 * the isolated `UsageCounter` model — never user/integration-scoped tables.
 */
class UsageRepositoryPostgres extends UsageRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async increment({
        integrationId,
        integrationType,
        metric,
        window,
        value = 1,
    }) {
        const where = {
            integrationId_integrationType_metric_window: {
                integrationId,
                integrationType,
                metric,
                window,
            },
        };
        const upsertArgs = {
            where,
            create: { integrationId, integrationType, metric, window, value },
            update: { value: { increment: value } },
        };

        try {
            await this.prisma.usageCounter.upsert(upsertArgs);
        } catch (err) {
            // Concurrent first-insert race: two workers both INSERT and one
            // hits the unique constraint. Retry once — the row now exists so
            // the retry takes the atomic UPDATE (increment) path.
            if (err && err.code === 'P2002') {
                await this.prisma.usageCounter.upsert(upsertArgs);
                return;
            }
            throw err;
        }
    }

    async totals({ metric, groupBy = 'integrationType', since } = {}) {
        const where = { metric };
        if (since) where.updatedAt = { gte: since };

        const groups = await this.prisma.usageCounter.groupBy({
            by: [groupBy],
            where,
            _sum: { value: true },
        });

        return groups.map((group) => ({
            [groupBy]: group[groupBy],
            value: group._sum?.value ?? 0,
        }));
    }

    async series({ metric, integrationType, from, to, bucket = 'day' } = {}) {
        const where = {
            metric,
            integrationType,
            window: { startsWith: `${bucket}:` },
        };
        if (from || to) {
            where.updatedAt = {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
            };
        }

        const rows = await this.prisma.usageCounter.findMany({
            where,
            orderBy: { window: 'asc' },
        });

        return rows.map((row) => ({ bucket: row.window, value: row.value }));
    }
}

module.exports = { UsageRepositoryPostgres };
