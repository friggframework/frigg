const { ObjectId } = require('bson');

function toObjectId(value) {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof ObjectId) return value;
    if (typeof value === 'object' && value.$oid) return new ObjectId(value.$oid);
    if (typeof value === 'string') return ObjectId.isValid(value) ? new ObjectId(value) : undefined;
    return undefined;
}

function toObjectIdArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map(toObjectId).filter(Boolean);
}

function fromObjectId(value) {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'object' && value !== null && value.$oid) return value.$oid;
    if (typeof value === 'string') return value;
    return value === undefined || value === null ? value : String(value);
}

async function findMany(client, collection, filter = {}, options = {}) {
    const command = { find: collection, filter };
    if (options.projection) command.projection = options.projection;
    if (options.sort) command.sort = options.sort;
    if (options.limit) command.limit = options.limit;
    const result = await client.$runCommandRaw(command);
    return result?.cursor?.firstBatch || [];
}

async function findOne(client, collection, filter = {}, options = {}) {
    const docs = await findMany(client, collection, filter, { ...options, limit: 1 });
    return docs[0] || null;
}

async function insertOne(client, collection, document) {
    // Generate ObjectId if not present (MongoDB raw insert doesn't return insertedIds)
    const _id = document._id || new ObjectId();
    const docWithId = { ...document, _id };

    const result = await client.$runCommandRaw({
        insert: collection,
        documents: [docWithId],
    });

    // Validate insert succeeded
    if (result.ok !== 1) {
        throw new Error(
            `Insert command failed for collection '${collection}': ${JSON.stringify(result)}`
        );
    }

    // Check for write errors (duplicate keys, validation errors, etc.)
    if (result.writeErrors && result.writeErrors.length > 0) {
        const error = result.writeErrors[0];
        const errorMsg = `Insert failed in '${collection}': ${error.errmsg} (code: ${error.code})`;

        // Provide helpful context for common errors
        if (error.code === 11000) {
            throw new Error(`${errorMsg} - Duplicate key violation`);
        }
        throw new Error(errorMsg);
    }

    // Verify exactly one document was inserted
    if (result.n !== 1) {
        throw new Error(
            `Expected to insert 1 document into '${collection}', but inserted ${result.n}. ` +
            `Result: ${JSON.stringify(result)}`
        );
    }

    return _id;
}

async function updateOne(client, collection, filter, update, options = {}) {
    const updates = [{
        q: filter,
        u: update,
        upsert: Boolean(options.upsert),
    }];
    if (options.arrayFilters) updates[0].arrayFilters = options.arrayFilters;
    const result = await client.$runCommandRaw({
        update: collection,
        updates,
    });
    return result;
}

async function deleteOne(client, collection, filter) {
    return client.$runCommandRaw({
        delete: collection,
        deletes: [
            {
                q: filter,
                limit: 1,
            },
        ],
    });
}

async function deleteMany(client, collection, filter) {
    return client.$runCommandRaw({
        delete: collection,
        deletes: [
            {
                q: filter,
                limit: 0,
            },
        ],
    });
}

async function aggregate(client, collection, pipeline) {
    const result = await client.$runCommandRaw({
        aggregate: collection,
        pipeline,
        cursor: {},
    });
    return result?.cursor?.firstBatch || [];
}

// findMany/aggregate return ONLY the first batch (~101 docs); the drained variants below follow the cursor to completion so full scans don't silently truncate.
const DRAIN_BATCH_SIZE = 1000;
const MAX_DRAIN_BATCHES = 100000;

function isCursorOpen(id) {
    if (id === undefined || id === null) return false;
    if (typeof id === 'number') return id !== 0;
    if (typeof id === 'bigint') return id !== 0n;
    // Extended JSON can surface a 64-bit cursor id as { $numberLong: "..." }.
    if (typeof id === 'object' && id.$numberLong !== undefined) {
        return id.$numberLong !== '0';
    }
    return String(id) !== '0';
}

async function drainCursor(client, collection, firstResult) {
    const cursor = firstResult?.cursor || {};
    const docs = [...(cursor.firstBatch || [])];
    let cursorId = cursor.id;
    let batches = 0;

    while (isCursorOpen(cursorId) && batches < MAX_DRAIN_BATCHES) {
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

async function findManyDrained(client, collection, filter = {}, options = {}) {
    const command = { find: collection, filter, batchSize: DRAIN_BATCH_SIZE };
    if (options.projection) command.projection = options.projection;
    if (options.sort) command.sort = options.sort;
    const first = await client.$runCommandRaw(command);
    return drainCursor(client, collection, first);
}

async function aggregateDrained(client, collection, pipeline) {
    const first = await client.$runCommandRaw({
        aggregate: collection,
        pipeline,
        cursor: { batchSize: DRAIN_BATCH_SIZE },
    });
    return drainCursor(client, collection, first);
}

module.exports = {
    toObjectId,
    toObjectIdArray,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
    deleteMany,
    aggregate,
    findManyDrained,
    aggregateDrained,
};

