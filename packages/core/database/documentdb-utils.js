const { ObjectId } = require('mongodb');

function toObjectId(value) {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof ObjectId) return value;
    if (typeof value === 'object' && value.$oid)
        return new ObjectId(value.$oid);
    if (typeof value === 'string')
        return ObjectId.isValid(value) ? new ObjectId(value) : undefined;
    return undefined;
}

function toObjectIdArray(values) {
    if (!Array.isArray(values)) return [];
    return values.map(toObjectId).filter(Boolean);
}

function fromObjectId(value) {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'object' && value !== null && value.$oid)
        return value.$oid;
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
    const docs = await findMany(client, collection, filter, {
        ...options,
        limit: 1,
    });
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
            `Insert command failed for collection '${collection}': ${JSON.stringify(
                result
            )}`
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
    const updates = [
        {
            q: filter,
            u: update,
            upsert: Boolean(options.upsert),
        },
    ];
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
};
