const { prisma } = require('../../database/prisma');
const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

/**
 * PostgreSQL Reporting Repository Adapter
 *
 * PostgreSQL-specific characteristics:
 * - Int IDs with autoincrement; converted to/from strings at the app boundary
 * - Many-to-many entities via implicit join table (counted via included relation)
 * - Reads only non-encrypted scalar fields + entity ids; mapping counts use
 *   `groupBy` (encryption-extension passthrough), so nothing is ever decrypted.
 */
class ReportingRepositoryPostgres extends ReportingRepositoryInterface {
    constructor() {
        super();
        this.prisma = prisma;
    }

    /**
     * Convert string ID to integer for PostgreSQL queries
     * @private
     * @param {string|number|null|undefined} id - ID to convert
     * @returns {number|null|undefined} Integer ID or null/undefined
     * @throws {Error} If ID cannot be converted to integer
     */
    _convertId(id) {
        if (id === null || id === undefined) return id;
        // Require an exact integer string — `parseInt` would otherwise coerce
        // '12abc'/'12.9' to 12 and silently return the wrong record.
        const str = String(id).trim();
        if (!/^-?\d+$/.test(str)) {
            throw new Error(`Invalid ID: ${id} cannot be converted to integer`);
        }
        return parseInt(str, 10);
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
}

module.exports = { ReportingRepositoryPostgres };
