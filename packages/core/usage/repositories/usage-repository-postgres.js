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

    async totals({
        metric,
        groupBy = 'integrationType',
        since,
        bucket = 'day',
    } = {}) {
        if (!metric) {
            throw new Error('totals requires a metric (units are per-metric)');
        }
        assertGroupBy(groupBy);
        assertBucket(bucket);

        // Filter to ONE window granularity — every event is written to both a
        // day: and an hour: row, so summing across granularities would double
        // (or worse) the true count.
        const where = { metric, window: { startsWith: `${bucket}:` } };
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
        assertBucket(bucket);
        if (!integrationType) {
            throw new Error('series requires an integrationType');
        }

        // Range-filter on the WINDOW key (write-time `updatedAt` would misplace a
        // late increment for an earlier window). Window keys are ISO-lexicographic
        // within a granularity, so string gte/lte gives the correct range.
        const window = { startsWith: `${bucket}:` };
        if (from) window.gte = windowKey(bucket, from);
        if (to) window.lte = windowKey(bucket, to);

        // Aggregate ACROSS integration instances: there is one row per
        // (integrationId, integrationType, metric, window), so a type with many
        // instances has many rows per window — sum them into one point.
        const groups = await this.prisma.usageCounter.groupBy({
            by: ['window'],
            where: { metric, integrationType, window },
            _sum: { value: true },
            orderBy: { window: 'asc' },
        });

        return groups.map((group) => ({
            bucket: group.window,
            value: group._sum?.value ?? 0,
        }));
    }
}

const VALID_GROUP_BY = new Set(['integrationType', 'metric']);
const VALID_BUCKETS = new Set(['day', 'hour']);

function assertGroupBy(groupBy) {
    if (!VALID_GROUP_BY.has(groupBy)) {
        throw new Error(
            `Invalid groupBy "${groupBy}". Allowed: ${[...VALID_GROUP_BY].join(
                ', '
            )}`
        );
    }
}

function assertBucket(bucket) {
    if (!VALID_BUCKETS.has(bucket)) {
        throw new Error(
            `Invalid bucket "${bucket}". Allowed: ${[...VALID_BUCKETS].join(
                ', '
            )}`
        );
    }
}

/** Window key for a date at a granularity (mirrors telemetry/usage-windows). */
function windowKey(bucket, date) {
    const iso = new Date(date).toISOString();
    return `${bucket}:${
        bucket === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10)
    }`;
}

module.exports = { UsageRepositoryPostgres };
