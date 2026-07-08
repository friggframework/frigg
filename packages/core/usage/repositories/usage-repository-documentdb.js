const { prisma } = require('../../database/prisma');
const { updateOne } = require('../../database/documentdb-utils');
const { UsageRepositoryPrisma } = require('./usage-repository-prisma');

const COLLECTION = 'UsageCounter';
const DRAIN_BATCH_SIZE = 1000;
const MAX_BATCHES = 100000;
const VALID_GROUP_BY = new Set(['integrationType', 'metric']);
const VALID_BUCKETS = new Set(['day', 'hour']);

/**
 * DocumentDB usage store. Amazon DocumentDB does not accept the command shapes
 * Prisma's Mongo engine emits for `upsert({ update: { value: { increment } } })`
 * and `groupBy({ _sum })`, and cursor reads truncate at ~101 docs — so, like
 * every other DocumentDB adapter in this repo, these operations are issued as
 * raw commands (`$runCommandRaw`) via the validated documentdb-utils helpers and
 * a drained aggregate cursor. No timestamps are managed: getTotalsByDimension/getTimeSeries filter on
 * the window KEY (not write-time), so createdAt/updatedAt are unnecessary here.
 */
class UsageRepositoryDocumentDB extends UsageRepositoryPrisma {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async increment({ integrationId, integrationType, metric, window, value = 1 }) {
        // Atomic upsert-increment: $inc creates the field at the increment value
        // on insert; $setOnInsert stamps the identity on first write. The compound
        // filter is the unique key, so concurrent writers converge on one row.
        await updateOne(
            this.prisma,
            COLLECTION,
            { integrationId, integrationType, metric, window },
            {
                $inc: { value },
                $setOnInsert: {
                    integrationId,
                    integrationType,
                    metric,
                    window,
                },
            },
            { upsert: true }
        );
    }

    async getTotalsByDimension({
        metric,
        groupBy = 'integrationType',
        since,
        bucket = 'day',
    } = {}) {
        if (!metric) {
            throw new Error('getTotalsByDimension requires a metric (units are per-metric)');
        }
        assertGroupBy(groupBy);
        assertBucket(bucket);

        // Single window granularity (day: OR hour:) — never sum across both.
        // `since` bounds on the window KEY (mirrors getTimeSeries / the Prisma adapter).
        const rows = await this._aggregateDrained([
            {
                $match: {
                    metric,
                    window: windowMatch(bucket, {
                        gte: since ? windowKey(bucket, since) : undefined,
                    }),
                },
            },
            { $group: { _id: `$${groupBy}`, value: { $sum: '$value' } } },
        ]);

        return rows.map((row) => ({
            [groupBy]: row._id,
            value: toNumber(row.value),
        }));
    }

    async getTimeSeries({ metric, integrationType, from, to, bucket = 'day' } = {}) {
        assertBucket(bucket);
        if (!integrationType) {
            throw new Error('getTimeSeries requires an integrationType');
        }

        const rows = await this._aggregateDrained([
            {
                $match: {
                    metric,
                    integrationType,
                    window: windowMatch(bucket, {
                        gte: from ? windowKey(bucket, from) : undefined,
                        lte: to ? windowKey(bucket, to) : undefined,
                    }),
                },
            },
            { $group: { _id: '$window', value: { $sum: '$value' } } },
            { $sort: { _id: 1 } },
        ]);

        return rows.map((row) => ({
            bucket: row._id,
            value: toNumber(row.value),
        }));
    }

    async _aggregateDrained(pipeline) {
        const first = await this.prisma.$runCommandRaw({
            aggregate: COLLECTION,
            pipeline,
            cursor: { batchSize: DRAIN_BATCH_SIZE },
        });
        return drainCursor(this.prisma, COLLECTION, first);
    }
}

/** A `$match` window clause: prefix by granularity, optionally range-bounded. */
function windowMatch(bucket, { gte, lte } = {}) {
    const clause = { $regex: `^${bucket}:` };
    if (gte) clause.$gte = gte;
    if (lte) clause.$lte = lte;
    return clause;
}

/** Window key for a date at a granularity (mirrors telemetry/usage-windows). */
function windowKey(bucket, date) {
    const iso = new Date(date).toISOString();
    return `${bucket}:${bucket === 'hour' ? iso.slice(0, 13) : iso.slice(0, 10)}`;
}

/**
 * Coerce an aggregate `$sum` result to a JS Number. Prisma $runCommandRaw returns
 * extended JSON, so a 64-bit sum can arrive as { $numberLong: "..." } (or
 * $numberInt/$numberDouble); counts never approach 2^53.
 */
function toNumber(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'object') {
        const raw =
            value.$numberLong ?? value.$numberInt ?? value.$numberDouble;
        if (raw !== undefined) return Number(raw);
    }
    return Number(value) || 0;
}

async function drainCursor(client, collection, firstResult) {
    const cursor = firstResult?.cursor || {};
    const docs = [...(cursor.firstBatch || [])];
    let cursorId = cursor.id;
    let batches = 0;

    while (isCursorOpen(cursorId) && batches < MAX_BATCHES) {
        batches += 1;
        const next = await client.$runCommandRaw({
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

function isCursorOpen(id) {
    if (id === undefined || id === null) return false;
    if (typeof id === 'number') return id !== 0;
    if (typeof id === 'bigint') return id !== 0n;
    if (typeof id === 'object' && id.$numberLong !== undefined) {
        return id.$numberLong !== '0';
    }
    return String(id) !== '0';
}

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

module.exports = { UsageRepositoryDocumentDB };
