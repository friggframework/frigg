const { prisma } = require('../../database/prisma');
const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

class ReportingRepositoryPostgres extends ReportingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsForReport({ status, userId } = {}) {
        const where = {};
        if (status) where.status = status;
        if (userId !== undefined && userId !== null) {
            where.userId = this._convertId(userId);
        }

        const integrations = await this.prisma.integration.findMany({
            where,
            include: { entities: { select: { id: true } } },
        });

        return integrations.map((integration) => ({
            id: integration.id?.toString(),
            type: integration.config?.type ?? null,
            status: integration.status ?? null,
            userId: integration.userId?.toString() ?? null,
            version: integration.version ?? null,
            errorCount: Array.isArray(integration.errors)
                ? integration.errors.length
                : 0,
            moduleCount: integration.entities?.length ?? 0,
            createdAt: integration.createdAt ?? null,
            updatedAt: integration.updatedAt ?? null,
        }));
    }

    async countMappingsByIntegrationIds(ids = []) {
        const counts = new Map();
        if (!ids || ids.length === 0) return counts;

        const intIds = ids.map((id) => this._convertId(id));
        const groups = await this.prisma.integrationMapping.groupBy({
            by: ['integrationId'],
            where: { integrationId: { in: intIds } },
            _count: { _all: true },
        });

        for (const group of groups) {
            counts.set(group.integrationId?.toString(), group._count._all);
        }
        return counts;
    }

    _convertId(id) {
        if (id === null || id === undefined) return id;
        // Reject anything that isn't an exact integer — parseInt would coerce
        // '12abc'/'12.9' to 12 and return the wrong record.
        const str = String(id).trim();
        if (!/^-?\d+$/.test(str)) {
            throw new TypeError(
                `Invalid ID: ${id} cannot be converted to integer`
            );
        }
        return Number.parseInt(str, 10);
    }
}

module.exports = { ReportingRepositoryPostgres };
