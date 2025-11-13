const { prisma } = require('../../database/prisma');
const {
    toObjectId,
    fromObjectId,
    findMany,
    findOne,
    insertOne,
    updateOne,
    deleteOne,
} = require('../../database/documentdb-utils');
const { ProcessRepositoryInterface } = require('./process-repository-interface');

class ProcessRepositoryDocumentDB extends ProcessRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async create(processData) {
        const now = new Date();
        const document = {
            userId: toObjectId(processData.userId),
            integrationId: toObjectId(processData.integrationId),
            name: processData.name,
            type: processData.type,
            state: processData.state || 'INITIALIZING',
            context: processData.context || {},
            results: processData.results || {},
            childProcesses: (processData.childProcesses || []).map((id) => toObjectId(id)).filter(Boolean),
            parentProcessId: processData.parentProcessId ? toObjectId(processData.parentProcessId) : null,
            createdAt: now,
            updatedAt: now,
        };
        const insertedId = await insertOne(this.prisma, 'Process', document);
        const created = await findOne(this.prisma, 'Process', { _id: insertedId });
        return this._mapProcess(created);
    }

    async findById(processId) {
        const objectId = toObjectId(processId);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Process', { _id: objectId });
        return doc ? this._mapProcess(doc) : null;
    }

    async update(processId, updates) {
        const objectId = toObjectId(processId);
        if (!objectId) return null;
        const updatePayload = {};
        if (updates.state !== undefined) updatePayload.state = updates.state;
        if (updates.context !== undefined) updatePayload.context = updates.context;
        if (updates.results !== undefined) updatePayload.results = updates.results;
        if (updates.childProcesses !== undefined) {
            updatePayload.childProcesses = (updates.childProcesses || []).map((id) => toObjectId(id)).filter(Boolean);
        }
        if (updates.parentProcessId !== undefined) {
            updatePayload.parentProcessId = updates.parentProcessId ? toObjectId(updates.parentProcessId) : null;
        }
        updatePayload.updatedAt = new Date();
        await updateOne(
            this.prisma,
            'Process',
            { _id: objectId },
            { $set: updatePayload }
        );
        const updated = await findOne(this.prisma, 'Process', { _id: objectId });
        return updated ? this._mapProcess(updated) : null;
    }

    async findByIntegrationAndType(integrationId, type) {
        const integrationObjectId = toObjectId(integrationId);
        const filter = {
            integrationId: integrationObjectId,
            type,
        };
        const docs = await findMany(this.prisma, 'Process', filter, {
            sort: { createdAt: -1 },
        });
        return docs.map((doc) => this._mapProcess(doc));
    }

    async findActiveProcesses(integrationId, excludeStates = ['COMPLETED', 'ERROR']) {
        const integrationObjectId = toObjectId(integrationId);
        const pipeline = [
            {
                $match: {
                    integrationId: integrationObjectId,
                },
            },
            {
                $match: {
                    state: { $nin: excludeStates },
                },
            },
            { $sort: { createdAt: -1 } },
        ];
        const docs = await this.prisma.$runCommandRaw({
            aggregate: 'Process',
            pipeline,
            cursor: {},
        }).then((res) => res?.cursor?.firstBatch || []);
        return docs.map((doc) => this._mapProcess(doc));
    }

    async findByName(name) {
        const doc = await findOne(
            this.prisma,
            'Process',
            { name },
            { sort: { createdAt: -1 } }
        );
        return doc ? this._mapProcess(doc) : null;
    }

    async deleteById(processId) {
        const objectId = toObjectId(processId);
        if (!objectId) return;
        await deleteOne(this.prisma, 'Process', { _id: objectId });
    }

    _mapProcess(doc) {
        return {
            id: fromObjectId(doc?._id),
            userId: fromObjectId(doc?.userId),
            integrationId: fromObjectId(doc?.integrationId),
            name: doc?.name ?? null,
            type: doc?.type ?? null,
            state: doc?.state ?? null,
            context: doc?.context ?? {},
            results: doc?.results ?? {},
            childProcesses: (doc?.childProcesses || []).map((id) => fromObjectId(id)),
            parentProcessId: doc?.parentProcessId ? fromObjectId(doc.parentProcessId) : null,
            createdAt: doc?.createdAt ? new Date(doc.createdAt) : null,
            updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : null,
        };
    }
}

module.exports = { ProcessRepositoryDocumentDB };


