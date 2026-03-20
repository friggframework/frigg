import { ObjectId } from 'bson';
import type { PrismaClientLike } from './prisma';

export interface FindManyOptions {
    projection?: Record<string, unknown>;
    sort?: Record<string, unknown>;
    limit?: number;
}

export function toObjectId(value: unknown): ObjectId | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (value instanceof ObjectId) return value;
    if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).$oid) {
        return new ObjectId((value as Record<string, string>).$oid);
    }
    if (typeof value === 'string') return ObjectId.isValid(value) ? new ObjectId(value) : undefined;
    return undefined;
}

export function toObjectIdArray(values: unknown[]): ObjectId[] {
    if (!Array.isArray(values)) return [];
    return values.flatMap(v => { const id = toObjectId(v); return id !== undefined ? [id] : []; });
}

export function fromObjectId(value: unknown): string | null | undefined {
    if (value instanceof ObjectId) return value.toHexString();
    if (typeof value === 'object' && value !== null && (value as Record<string, unknown>).$oid) {
        return (value as Record<string, string>).$oid;
    }
    if (typeof value === 'string') return value;
    return value === undefined || value === null ? value : String(value);
}

export async function findMany(
    client: PrismaClientLike,
    collection: string,
    filter: Record<string, unknown> = {},
    options: FindManyOptions = {}
): Promise<Record<string, unknown>[]> {
    const command: Record<string, unknown> = { find: collection, filter };
    if (options.projection) command.projection = options.projection;
    if (options.sort) command.sort = options.sort;
    if (options.limit) command.limit = options.limit;
    const result = await client.$runCommandRaw!(command);
    return ((result as Record<string, unknown>)?.cursor as Record<string, unknown>)?.firstBatch as Record<string, unknown>[] || [];
}

export async function findOne(
    client: PrismaClientLike,
    collection: string,
    filter: Record<string, unknown> = {},
    options: FindManyOptions = {}
): Promise<Record<string, unknown> | null> {
    const docs = await findMany(client, collection, filter, { ...options, limit: 1 });
    return docs[0] || null;
}

export async function insertOne(
    client: PrismaClientLike,
    collection: string,
    document: Record<string, unknown>
): Promise<ObjectId> {
    const _id = (document._id as ObjectId) || new ObjectId();
    const docWithId = { ...document, _id };

    const result = await client.$runCommandRaw!({
        insert: collection,
        documents: [docWithId],
    }) as Record<string, unknown>;

    if (result.ok !== 1) {
        throw new Error(
            `Insert command failed for collection '${collection}': ${JSON.stringify(result)}`
        );
    }

    if (result.writeErrors && (result.writeErrors as unknown[]).length > 0) {
        const error = (result.writeErrors as Array<{ errmsg: string; code: number }>)[0];
        const errorMsg = `Insert failed in '${collection}': ${error.errmsg} (code: ${error.code})`;

        if (error.code === 11000) {
            throw new Error(`${errorMsg} - Duplicate key violation`);
        }
        throw new Error(errorMsg);
    }

    if (result.n !== 1) {
        throw new Error(
            `Expected to insert 1 document into '${collection}', but inserted ${result.n}. ` +
            `Result: ${JSON.stringify(result)}`
        );
    }

    return _id;
}

export async function updateOne(
    client: PrismaClientLike,
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options: { upsert?: boolean; arrayFilters?: unknown[] } = {}
): Promise<Record<string, unknown>> {
    const updates: Record<string, unknown>[] = [{
        q: filter,
        u: update,
        upsert: Boolean(options.upsert),
    }];
    if (options.arrayFilters) updates[0].arrayFilters = options.arrayFilters;
    const result = await client.$runCommandRaw!({
        update: collection,
        updates,
    });
    return result as Record<string, unknown>;
}

export async function deleteOne(
    client: PrismaClientLike,
    collection: string,
    filter: Record<string, unknown>
): Promise<Record<string, unknown>> {
    return client.$runCommandRaw!({
        delete: collection,
        deletes: [
            {
                q: filter,
                limit: 1,
            },
        ],
    }) as Promise<Record<string, unknown>>;
}

export async function deleteMany(
    client: PrismaClientLike,
    collection: string,
    filter: Record<string, unknown>
): Promise<Record<string, unknown>> {
    return client.$runCommandRaw!({
        delete: collection,
        deletes: [
            {
                q: filter,
                limit: 0,
            },
        ],
    }) as Promise<Record<string, unknown>>;
}

export async function aggregate(
    client: PrismaClientLike,
    collection: string,
    pipeline: Record<string, unknown>[]
): Promise<Record<string, unknown>[]> {
    const result = await client.$runCommandRaw!({
        aggregate: collection,
        pipeline,
        cursor: {},
    });
    return ((result as Record<string, unknown>)?.cursor as Record<string, unknown>)?.firstBatch as Record<string, unknown>[] || [];
}
