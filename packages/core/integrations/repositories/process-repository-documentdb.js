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

/**
 * @see credential-repository-documentdb.js for the same pattern
 * @see integration-mapping-repository-documentdb.js for the same pattern
 * @see encryption-schema-registry.js for custom schema configuration
 */
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
