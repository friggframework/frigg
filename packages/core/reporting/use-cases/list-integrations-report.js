const SCHEMA_VERSION = 1;
const SERVICE = 'frigg-core-api';

// Display seed so every known status appears in the output (even at zero).
// Increments are dynamic, so a NEW IntegrationStatus value added to the schema
// is still picked up — it just won't be pre-seeded at zero.
const KNOWN_STATUSES = [
    'ENABLED',
    'ERROR',
    'NEEDS_CONFIG',
    'PROCESSING',
    'DISABLED',
];

function emptyStatusCounts() {
    return KNOWN_STATUSES.reduce((acc, status) => {
        acc[status] = 0;
        return acc;
    }, {});
}

function toIso(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString();
    // DocumentDB raw reads can surface extended-JSON dates: { $date: ... }
    if (typeof value === 'object' && value.$date) {
        const date = new Date(value.$date);
        return isNaN(date.getTime()) ? null : date.toISOString();
    }
    return String(value);
}

/**
 * ListIntegrationsReport
 *
 * Read-only, deployment-wide report of integrations: total + status breakdown +
 * per-type breakdown + lightweight per-integration rows (status, type, userId,
 * version, moduleCount, errorCount, mappedRecordCount, timestamps).
 *
 * `status` and `userId` are pushed to the repository query; `type` is filtered
 * here (it lives in `config.type`, a JSON path that is not portably groupable).
 */
class ListIntegrationsReport {
    constructor({ reportingRepository } = {}) {
        if (!reportingRepository) {
            throw new Error('reportingRepository is required');
        }
        this.reportingRepository = reportingRepository;
    }

    async execute({ status, type, userId } = {}) {
        const rows = await this.reportingRepository.findIntegrationsForReport({
            status,
            userId,
        });

        const filtered =
            type === undefined || type === null
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
            // Bucket under a sentinel when status is missing so a null never
            // becomes a literal "null" key (only reachable for malformed rows).
            const statusKey = integration.status ?? 'UNKNOWN';
            byStatus[statusKey] = (byStatus[statusKey] ?? 0) + 1;

            if (!byTypeMap.has(integration.type)) {
                byTypeMap.set(integration.type, {
                    type: integration.type,
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
                integrations,
            },
        };
    }
}

module.exports = { ListIntegrationsReport, SCHEMA_VERSION, KNOWN_STATUSES };
