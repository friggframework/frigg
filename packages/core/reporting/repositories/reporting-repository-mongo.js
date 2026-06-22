const { prisma } = require('../../database/prisma');
const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

class ReportingRepositoryMongo extends ReportingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    async findIntegrationsForReport({ status, userId } = {}) {
        const where = {};
        if (status) where.status = status;
        if (userId !== undefined && userId !== null) where.userId = userId;

        const integrations = await this.prisma.integration.findMany({
            where,
            include: { entities: { select: { id: true } } },
        });

        return integrations.map((integration) => ({
            id: integration.id,
            type: integration.config?.type ?? null,
            status: integration.status ?? null,
            userId: integration.userId ?? null,
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

        const groups = await this.prisma.integrationMapping.groupBy({
            by: ['integrationId'],
            where: { integrationId: { in: ids } },
            _count: { _all: true },
        });

        for (const group of groups) {
            counts.set(group.integrationId, group._count._all);
        }
        return counts;
    }
}

module.exports = { ReportingRepositoryMongo };
