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
const {
    ProcessRepositoryInterface,
} = require('./process-repository-interface');
const {
    DocumentDBEncryptionService,
} = require('../../database/documentdb-encryption-service');
const { validateOps } = require('./process-update-ops-shared');

class ProcessRepositoryDocumentDB extends ProcessRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
        this.encryptionService = new DocumentDBEncryptionService();
    }

    async create(processData) {
        const now = new Date();
        const plainDocument = {
            userId: toObjectId(processData.userId),
            integrationId: toObjectId(processData.integrationId),
            name: processData.name,
            type: processData.type,
            state: processData.state || 'INITIALIZING',
            context: processData.context || {},
            results: processData.results || {},
            childProcesses: (processData.childProcesses || [])
                .map((id) => toObjectId(id))
                .filter(Boolean),
            parentProcessId: processData.parentProcessId
                ? toObjectId(processData.parentProcessId)
                : null,
            createdAt: now,
            updatedAt: now,
        };

        const encryptedDocument = await this.encryptionService.encryptFields(
            'Process',
            plainDocument
        );

        const insertedId = await insertOne(
            this.prisma,
            'Process',
            encryptedDocument
        );

        const created = await findOne(this.prisma, 'Process', {
            _id: insertedId,
        });
        if (!created) {
            console.error(
                '[ProcessRepositoryDocumentDB] Process not found after insert',
                {
                    insertedId: fromObjectId(insertedId),
                    processData: {
                        userId: processData.userId,
                        integrationId: processData.integrationId,
                        name: processData.name,
                        type: processData.type,
                    },
                }
            );
            throw new Error(
                'Failed to create process: Document not found after insert. ' +
                    'This indicates a database consistency issue.'
            );
        }
        const decryptedProcess = await this.encryptionService.decryptFields(
            'Process',
            created
        );
        return this._mapProcess(decryptedProcess);
    }

    async findById(processId) {
        const objectId = toObjectId(processId);
        if (!objectId) return null;
        const doc = await findOne(this.prisma, 'Process', { _id: objectId });
        if (!doc) return null;

        const decryptedProcess = await this.encryptionService.decryptFields(
            'Process',
            doc
        );
        return this._mapProcess(decryptedProcess);
    }

    async update(processId, updates) {
        const objectId = toObjectId(processId);
        if (!objectId) return null;

        const existing = await findOne(this.prisma, 'Process', {
            _id: objectId,
        });
        if (!existing) return null;

        const updatePayload = {};
        if (updates.state !== undefined) updatePayload.state = updates.state;
        if (updates.context !== undefined)
            updatePayload.context = updates.context;
        if (updates.results !== undefined)
            updatePayload.results = updates.results;
        if (updates.childProcesses !== undefined) {
            updatePayload.childProcesses = (updates.childProcesses || [])
                .map((id) => toObjectId(id))
                .filter(Boolean);
        }
        if (updates.parentProcessId !== undefined) {
            updatePayload.parentProcessId = updates.parentProcessId
                ? toObjectId(updates.parentProcessId)
                : null;
        }
        updatePayload.updatedAt = new Date();

        const encryptedUpdate = await this.encryptionService.encryptFields(
            'Process',
            updatePayload
        );

        await updateOne(
            this.prisma,
            'Process',
            { _id: objectId },
            { $set: encryptedUpdate }
        );

        const updated = await findOne(this.prisma, 'Process', {
            _id: objectId,
        });
        if (!updated) {
            console.error(
                '[ProcessRepositoryDocumentDB] Process not found after update',
                {
                    processId: fromObjectId(objectId),
                }
            );
            throw new Error(
                'Failed to update process: Document not found after update. ' +
                    'This indicates a database consistency issue.'
            );
        }
        const decryptedProcess = await this.encryptionService.decryptFields(
            'Process',
            updated
        );
        return this._mapProcess(decryptedProcess);
    }

    /**
     * Atomic process update — race-safe counterpart to `update()`.
     *
     * Uses DocumentDB's native $inc / $set / $push operators (Mongo-wire
     * compatible) via findAndModify so increments, sets, and pushes land
     * in one server-side write. Contention on the same document
     * serializes at the DB level.
     *
     * DocumentDB compatibility notes:
     *  - $inc: supported since v3.6.
     *  - $set with dot-path: supported.
     *  - $push with $each + negative $slice: supported since v4.0.
     *    Clusters still on v3.6 must upgrade before using pushSlice.
     *
     * Process documents have no encrypted fields today; if that changes,
     * the set-by-path payload here MUST route through
     * `encryptionService.encryptFields` for any affected paths.
     *
     * @param {string} processId
     * @param {import('./process-repository-interface').ProcessUpdateOps} ops
     * @returns {Promise<Object|null>}
     */
    async applyProcessUpdate(processId, ops) {
        const normalized = validateOps(ops);
        const objectId = toObjectId(processId);

        const update = {};
        const $set = {};

        if (Object.keys(normalized.increment).length > 0) {
            update.$inc = { ...normalized.increment };
        }
        for (const [path, value] of Object.entries(normalized.set)) {
            $set[path] = value;
        }
        if (normalized.newState !== null) {
            $set.state = normalized.newState;
        }
        $set.updatedAt = new Date();
        update.$set = $set;

        if (Object.keys(normalized.pushSlice).length > 0) {
            update.$push = {};
            for (const [path, spec] of Object.entries(normalized.pushSlice)) {
                update.$push[path] = {
                    $each: spec.values,
                    $slice: -spec.keepLast,
                };
            }
        }

        const result = await this.prisma.$runCommandRaw({
            findAndModify: 'Process',
            query: { _id: objectId },
            update,
            new: true,
        });

        const doc = result && result.value;
        if (!doc) return null;
        const decrypted = await this.encryptionService.decryptFields(
            'Process',
            doc
        );
        return this._mapProcess(decrypted);
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

        const decryptedDocs = await Promise.all(
            docs.map((doc) =>
                this.encryptionService.decryptFields('Process', doc)
            )
        );

        return decryptedDocs.map((doc) => this._mapProcess(doc));
    }

    async findActiveProcesses(
        integrationId,
        excludeStates = ['COMPLETED', 'ERROR']
    ) {
        const integrationObjectId = toObjectId(integrationId);
        const filter = {
            integrationId: integrationObjectId,
            state: { $nin: excludeStates },
        };
        const docs = await findMany(this.prisma, 'Process', filter, {
            sort: { createdAt: -1 },
        });

        const decryptedDocs = await Promise.all(
            docs.map((doc) =>
                this.encryptionService.decryptFields('Process', doc)
            )
        );

        return decryptedDocs.map((doc) => this._mapProcess(doc));
    }

    async findByName(name) {
        const doc = await findOne(
            this.prisma,
            'Process',
            { name },
            { sort: { createdAt: -1 } }
        );
        if (!doc) return null;

        const decryptedProcess = await this.encryptionService.decryptFields(
            'Process',
            doc
        );
        return this._mapProcess(decryptedProcess);
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
            childProcesses: (doc?.childProcesses || []).map((id) =>
                fromObjectId(id)
            ),
            parentProcessId: doc?.parentProcessId
                ? fromObjectId(doc.parentProcessId)
                : null,
            createdAt: doc?.createdAt ? new Date(doc.createdAt) : null,
            updatedAt: doc?.updatedAt ? new Date(doc.updatedAt) : null,
        };
    }
}

module.exports = { ProcessRepositoryDocumentDB };
