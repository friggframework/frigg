const Boom = require('@hapi/boom');

const SCHEMA_VERSION = 1;
const SERVICE = 'frigg-core-api';

// Seeded so every known status appears (even at 0); unknown values added to
// the schema later are still counted dynamically.
const KNOWN_STATUSES = [
    'ENABLED',
    'ERROR',
    'NEEDS_CONFIG',
    'PROCESSING',
    'DISABLED',
];

class ListIntegrationsReport {
    constructor({ reportingRepository, typeLabels = {} } = {}) {
        if (!reportingRepository) {
            throw new Error('reportingRepository is required');
        }
        this.reportingRepository = reportingRepository;
        this.typeLabels = typeLabels;
    }

    async execute(query = {}) {
        const { status, type, userId } = this._validateQuery(query);

        const rows = await this.reportingRepository.findIntegrationsForReport({
            status,
            userId,
        });

        // type lives in config.type (a JSON path not portably groupable across
        // DBs), so it is filtered here rather than in the repository query.
        const filtered =
            type === undefined
                ? rows
                : rows.filter((row) => (row.type ?? 'unknown') === type);

        const ids = filtered.map((row) => row.id);
        const mappingCounts = ids.length
            ? await this.reportingRepository.countMappingsByIntegrationIds(ids)
            : new Map();

        const integrations = filtered.map((row) => ({
            id: row.id,
            type: row.type ?? 'unknown',
            status: row.status ?? null,
            userId: row.userId ?? null,
            version: row.version ?? null,
            moduleCount: row.moduleCount ?? 0,
            errorCount: row.errorCount ?? 0,
            mappedRecordCount: mappingCounts.get(row.id) ?? 0,
            createdAt: toIso(row.createdAt),
            updatedAt: toIso(row.updatedAt),
        }));

        const byStatus = emptyStatusCounts();
        const byTypeMap = new Map();
        for (const integration of integrations) {
            // sentinel so a missing status never becomes a literal "null" key
            const statusKey = integration.status ?? 'UNKNOWN';
            byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;

            if (!byTypeMap.has(integration.type)) {
                byTypeMap.set(integration.type, {
                    type: integration.type,
                    label: this.typeLabels[integration.type] || integration.type,
                    total: 0,
                    byStatus: emptyStatusCounts(),
                });
            }
            const bucket = byTypeMap.get(integration.type);
            bucket.total += 1;
            bucket.byStatus[statusKey] = (bucket.byStatus[statusKey] ?? 0) + 1;
        }

        return {
            schemaVersion: SCHEMA_VERSION,
            service: SERVICE,
            generatedAt: new Date().toISOString(),
            filters: {
                status: status ?? null,
                type: type ?? null,
                userId: userId ?? null,
            },
            metrics: {
                total: integrations.length,
                byStatus,
                byType: Array.from(byTypeMap.values()),
                typeLabels: { ...this.typeLabels },
                integrations,
            },
        };
    }

    _validateQuery({ status, type, userId } = {}) {
        for (const [key, value] of Object.entries({ status, type, userId })) {
            if (value !== undefined && value !== null && typeof value !== 'string') {
                throw Boom.badRequest(
                    `Invalid query parameter '${key}': expected a string`
                );
            }
        }
        const normalize = (value) => value || undefined;
        const normalized = {
            status: normalize(status),
            type: normalize(type),
            userId: normalize(userId),
        };
        if (normalized.status && !KNOWN_STATUSES.includes(normalized.status)) {
            throw Boom.badRequest(
                `Invalid status '${normalized.status}'. Expected one of: ${KNOWN_STATUSES.join(
                    ', '
                )}`
            );
        }
        return normalized;
    }
}

function emptyStatusCounts() {
    return KNOWN_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
    }, {});
}

function toIso(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    // DocumentDB raw reads surface dates as { $date: ... }
    if (typeof value === 'object' && value.$date) {
        const date = new Date(value.$date);
        return Number.isNaN(date.getTime()) ? null : date.toISOString();
    }
    return String(value);
}

module.exports = { ListIntegrationsReport, SCHEMA_VERSION };
