/**
 * IntegrationDefinitionVersion persistence (ADR-063). Pure data access: one Prisma call per method, no business rules.
 * Which version is "latest", whether a publish is allowed and what a status change means are decided by the use cases
 * (../use-cases/definition-use-cases.js); this layer only stores and reads rows.
 *
 * Rows come back as plain objects with string ids on every database. `document` is the definition verbatim.
 */
const { prisma } = require('../../../database/prisma');

const FIELDS = ['definitionId', 'version', 'schemaVersion', 'status', 'checksum', 'document', 'changeLevel', 'previousVersion', 'notes', 'createdBy', 'workspaceId', 'publishedAt'];
const pick = (o) => Object.fromEntries(FIELDS.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

class DefinitionVersionRepositoryMongo {
    constructor({ client } = {}) { this.prisma = client || prisma; }
    toRow(r) { return r ? { ...r, id: String(r.id) } : null; }

    async findVersion(definitionId, version) {
        return this.toRow(await this.prisma.integrationDefinitionVersion.findUnique({ where: { definitionId_version: { definitionId, version } } }));
    }

    /** Every version of one definition, any status, unordered (semver order is the caller's business). */
    async listVersions(definitionId) {
        return (await this.prisma.integrationDefinitionVersion.findMany({ where: { definitionId } })).map((r) => this.toRow(r));
    }

    /** Rows in the given statuses across all definitions, without documents (a catalogue listing). */
    async listByStatus(statuses) {
        const rows = await this.prisma.integrationDefinitionVersion.findMany({
            where: { status: { in: statuses } },
            select: { id: true, definitionId: true, version: true, schemaVersion: true, status: true, checksum: true, changeLevel: true, workspaceId: true, publishedAt: true, createdAt: true },
        });
        return rows.map((r) => this.toRow(r));
    }

    async createVersion(data) {
        return this.toRow(await this.prisma.integrationDefinitionVersion.create({ data: pick(data) }));
    }

    /**
     * Change a row only if it is still in `fromStatus` (the use case's precondition, checked by the database, so two
     * concurrent publishes cannot both win). Returns the updated row, or null if it was not in that status.
     */
    async updateIfStatus(definitionId, version, fromStatus, data) {
        const { count } = await this.prisma.integrationDefinitionVersion.updateMany({ where: { definitionId, version, status: fromStatus }, data: pick(data) });
        return count ? this.findVersion(definitionId, version) : null;
    }

    async deleteIfStatus(definitionId, version, status) {
        const { count } = await this.prisma.integrationDefinitionVersion.deleteMany({ where: { definitionId, version, status } });
        return count > 0;
    }
}

class DefinitionVersionRepositoryPostgres extends DefinitionVersionRepositoryMongo {}
class DefinitionVersionRepositoryDocumentDB extends DefinitionVersionRepositoryMongo {}

function createDefinitionVersionRepository() {
    const { DB_TYPE } = require('../../../database/config');
    switch (DB_TYPE) {
        case 'mongodb': return new DefinitionVersionRepositoryMongo();
        case 'postgresql': return new DefinitionVersionRepositoryPostgres();
        case 'documentdb': return new DefinitionVersionRepositoryDocumentDB();
        default: throw new Error(`Unsupported database type: ${DB_TYPE}. Supported values: 'mongodb', 'documentdb', 'postgresql'`);
    }
}

module.exports = { createDefinitionVersionRepository, DefinitionVersionRepositoryMongo, DefinitionVersionRepositoryPostgres, DefinitionVersionRepositoryDocumentDB };
