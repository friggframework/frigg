/**
 * WorkflowRun persistence (ADR-063). Pure data access. A run row never holds request or response bodies: `trace` is
 * step ids, statuses, timings and error messages (see runtime.js).
 */
const { prisma } = require('../../../database/prisma');

class WorkflowRunRepositoryMongo {
    constructor({ client } = {}) { this.prisma = client || prisma; }
    toId(id) { return String(id); }
    toRowId(id) { return String(id); }
    toRow(r) { return r ? { ...r, id: String(r.id), integrationId: String(r.integrationId) } : null; }

    async createRun(run) {
        return this.toRow(await this.prisma.workflowRun.create({
            data: {
                integrationId: this.toId(run.integrationId), definitionId: run.definitionId, definitionVersion: run.definitionVersion,
                workflowId: run.workflowId, triggerType: run.triggerType, eventId: run.eventId ?? null, status: run.status,
                reason: run.reason ?? null, error: run.error ?? null, retryable: Boolean(run.retryable), trace: run.trace || [],
                runKey: run.runKey ?? null, waitingFor: run.waitingFor ?? null, resumeAt: run.resumeAt ? new Date(run.resumeAt) : null,
                startedAt: new Date(run.startedAt), endedAt: run.endedAt ? new Date(run.endedAt) : null,
            },
        }));
    }

    /** One run of an installation, by the runtime's run id. */
    async findRun(integrationId, runKey) {
        return this.toRow(await this.prisma.workflowRun.findFirst({ where: { integrationId: this.toId(integrationId), runKey: String(runKey) }, orderBy: { startedAt: 'desc' } }));
    }

    /** Update a run by its row id (a paused run finishing, or pausing again). Only the given fields change. */
    async updateRun(id, data) {
        const fields = {};
        for (const k of ['status', 'reason', 'error', 'retryable', 'trace', 'waitingFor']) if (k in data) fields[k] = data[k] ?? (k === 'trace' ? [] : null);
        if ('resumeAt' in data) fields.resumeAt = data.resumeAt ? new Date(data.resumeAt) : null;
        if ('endedAt' in data) fields.endedAt = data.endedAt ? new Date(data.endedAt) : null;
        return this.toRow(await this.prisma.workflowRun.update({ where: { id: this.toRowId(id) }, data: fields }));
    }

    /** Newest first. `before` pages by startedAt. */
    async listRuns(integrationId, { workflowId, status, before, limit = 50 } = {}) {
        const rows = await this.prisma.workflowRun.findMany({
            where: { integrationId: this.toId(integrationId), ...(workflowId ? { workflowId } : {}), ...(status ? { status } : {}), ...(before ? { startedAt: { lt: new Date(before) } } : {}) },
            orderBy: { startedAt: 'desc' },
            take: Math.min(Math.max(1, limit), 500),
        });
        return rows.map((r) => this.toRow(r));
    }

    /** Delete runs that started before `olderThan`, optionally only in some statuses. Returns the count. */
    async deleteRunsBefore(olderThan, { statuses } = {}) {
        const { count } = await this.prisma.workflowRun.deleteMany({ where: { startedAt: { lt: new Date(olderThan) }, ...(statuses ? { status: { in: statuses } } : {}) } });
        return count;
    }
}

class WorkflowRunRepositoryPostgres extends WorkflowRunRepositoryMongo {
    toId(id) {
        const n = Number.parseInt(id, 10);
        if (Number.isNaN(n)) throw new Error(`Invalid integration id: ${id}`);
        return n;
    }
    toRowId(id) {
        const n = Number.parseInt(id, 10);
        if (Number.isNaN(n)) throw new Error(`Invalid run id: ${id}`);
        return n;
    }
}
class WorkflowRunRepositoryDocumentDB extends WorkflowRunRepositoryMongo {}

function createWorkflowRunRepository() {
    const { DB_TYPE } = require('../../../database/config');
    switch (DB_TYPE) {
        case 'mongodb': return new WorkflowRunRepositoryMongo();
        case 'postgresql': return new WorkflowRunRepositoryPostgres();
        case 'documentdb': return new WorkflowRunRepositoryDocumentDB();
        default: throw new Error(`Unsupported database type: ${DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`);
    }
}

module.exports = { createWorkflowRunRepository, WorkflowRunRepositoryMongo, WorkflowRunRepositoryPostgres, WorkflowRunRepositoryDocumentDB };
