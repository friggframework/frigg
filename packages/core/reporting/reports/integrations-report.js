const { ReportBase } = require('../report-base');
const { CANONICAL_COUNTERS } = require('../../telemetry/canonical-counters');
const { loadAppDefinition } = require('../../handlers/app-definition-loader');

const SCHEMA_VERSION = 1;
const SERVICE = 'frigg-core-api';

// Seeded so every known status appears in output even at count 0.
const KNOWN_STATUSES = [
    'IN_CREATION',
    'ENABLED',
    'ERROR',
    'NEEDS_CONFIG',
    'PROCESSING',
    'IN_DELETION',
    'DISABLED',
];

// IntegrationBase.Definition default — skip it so the slug is used instead.
const PLACEHOLDER_DISPLAY_NAME = 'Integration Name';

class IntegrationsReport extends ReportBase {
    static Definition = {
        name: 'integrations',
        version: '1.0.0',
        description: 'Integrations by status and type, with per-type usage counts',
        source: 'BUILTIN',
        runModes: ['live', 'recorded', 'snapshot'],
        inputSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                status: { type: 'string' },
                type: { type: 'string' },
                userId: { type: 'string' },
            },
        },
        output: { format: 'json' },
        schedule: { enabled: false, cron: null, mode: 'snapshot' },
        display: { category: 'reporting', icon: null },
    };

    async execute(frigg, params = {}) {
        const { status, type, userId } = this._validateQuery(params);
        const typeLabels = buildTypeLabels();

        const rows = await frigg.integrations.listForReport({ status, userId });

        // type lives in config.type, a JSON path not portably groupable across DBs, so filter here not in the query.
        const filtered =
            type === undefined
                ? rows
                : rows.filter((row) => (row.type ?? 'unknown') === type);

        const ids = filtered.map((row) => row.id);
        const mappingCounts = ids.length
            ? await frigg.integrationMappings.countByIntegrationIds(ids)
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
                    label: typeLabels[integration.type] || integration.type,
                    total: 0,
                    byStatus: emptyStatusCounts(),
                });
            }
            const bucket = byTypeMap.get(integration.type);
            bucket.total += 1;
            bucket.byStatus[statusKey] = (bucket.byStatus[statusKey] ?? 0) + 1;
        }

        await this._attachUsageColumns(byTypeMap, frigg);

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
                typeLabels: { ...typeLabels },
                integrations,
            },
        };
    }

    async _attachUsageColumns(byTypeMap, frigg) {
        const metrics = Object.keys(CANONICAL_COUNTERS);
        try {
            const totalsByMetric = await Promise.all(
                metrics.map(async (metric) => {
                    const totals = await frigg.usage.getTotalsByDimension({
                        metric,
                        groupBy: 'integrationType',
                    });
                    const map = new Map(
                        (totals || []).map((t) => [t.integrationType, t.value])
                    );
                    return [metric, map];
                })
            );

            for (const bucket of byTypeMap.values()) {
                bucket.usage = {};
                for (const [metric, map] of totalsByMetric) {
                    bucket.usage[metric] = map.get(bucket.type) ?? 0;
                }
            }
        } catch (error) {
            console.warn(
                `[Frigg][reporting] usage columns unavailable: ${
                    error && error.message
                }`
            );
        }
    }

    _validateQuery({ status, type, userId } = {}) {
        for (const [key, value] of Object.entries({ status, type, userId })) {
            if (
                value !== undefined &&
                value !== null &&
                typeof value !== 'string'
            ) {
                throw invalidInput(
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
            throw invalidInput(
                `Invalid status '${
                    normalized.status
                }'. Expected one of: ${KNOWN_STATUSES.join(', ')}`
            );
        }
        return normalized;
    }
}

// INVALID_INPUT keeps the report protocol-agnostic; the runner/router map it to a 400.
function invalidInput(message) {
    const error = new Error(message);
    error.code = 'INVALID_INPUT';
    return error;
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

function buildTypeLabels() {
    try {
        const { integrations = [] } = loadAppDefinition();
        const labels = {};
        for (const IntegrationClass of integrations) {
            const def = IntegrationClass?.Definition;
            if (!def?.name) continue;
            const label = def.display?.label;
            if (label && label !== PLACEHOLDER_DISPLAY_NAME) {
                labels[def.name] = label;
            }
        }
        return labels;
    } catch (error) {
        console.error(
            'Reporting: failed to load integration labels:',
            error.message
        );
        return {};
    }
}

module.exports = { IntegrationsReport, SCHEMA_VERSION };
